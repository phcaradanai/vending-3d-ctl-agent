#!/usr/bin/env node
import { MANUAL_TEST_COMMANDS, MANUAL_TEST_FLOWS } from "../src/manual-test/commandCatalog.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(arg, next);
      i += 1;
    } else {
      args.set(arg, true);
    }
  }
}

const baseUrl = String(
  args.get("--base-url") ||
    process.env.MANUAL_TEST_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || "3000"}`
).replace(/\/+$/, "");
const token = String(args.get("--token") || process.env.API_BEARER_TOKEN || "");
const flowId = String(args.get("--flow") || process.env.MANUAL_TEST_FLOW || "preflight");
const execute = Boolean(args.get("--execute"));
const yesHardwareRisk = Boolean(args.get("--yes-hardware-risk"));

const commandById = new Map(MANUAL_TEST_COMMANDS.map((command) => [command.id, command]));
const flow = MANUAL_TEST_FLOWS.find((item) => item.id === flowId);

if (!flow) {
  console.error(`Unknown flow: ${flowId}`);
  console.error(`Available flows: ${MANUAL_TEST_FLOWS.map((item) => item.id).join(", ")}`);
  process.exit(2);
}

if (execute && flow.requiresExecuteConfirmation && !yesHardwareRisk) {
  console.error("Refusing hardware flow without --yes-hardware-risk.");
  console.error(`Flow "${flow.id}" can move or write hardware. Re-run with --execute --yes-hardware-risk when safe.`);
  process.exit(2);
}

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function redactHeaders(headers) {
  return {
    ...headers,
    Authorization: headers.Authorization ? "Bearer ***" : undefined,
  };
}

async function runStep(step, index) {
  const command = commandById.get(step.commandId);
  if (!command) {
    throw new Error(`Flow step ${index + 1} references unknown command "${step.commandId}"`);
  }

  const body = step.body !== undefined ? clone(step.body) : clone(command.defaultBody);
  const headers = { Accept: "application/json" };
  if (command.method !== "GET") headers["Content-Type"] = "application/json";
  if (command.protected && token) headers.Authorization = `Bearer ${token}`;

  const request = {
    method: command.method,
    url: `${baseUrl}${command.endpoint}`,
    headers: redactHeaders(headers),
    body,
  };

  console.log(`[${index + 1}/${flow.steps.length}] ${command.title}`);
  console.log(`${request.method} ${request.url}`);
  if (body !== null) console.log(JSON.stringify(body));

  if (!execute) {
    console.log("DRY_RUN skipped");
    return { ok: true, dryRun: true };
  }

  const startedAt = Date.now();
  const response = await fetch(request.url, {
    method: command.method,
    headers,
    body: command.method === "GET" ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let responseBody = text;
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON text for diagnostics.
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`${response.status} ${response.statusText} ${elapsedMs}ms`);
  console.log(JSON.stringify(responseBody, null, 2));

  if (!response.ok) {
    const error = new Error(`Step ${index + 1} failed with HTTP ${response.status}`);
    error.status = response.status;
    error.responseBody = responseBody;
    throw error;
  }

  return { ok: true, status: response.status, responseBody };
}

console.log(`Flow: ${flow.title} (${flow.id})`);
console.log(`Base URL: ${baseUrl}`);
console.log(`Mode: ${execute ? "EXECUTE" : "DRY_RUN"}`);

for (let index = 0; index < flow.steps.length; index += 1) {
  await runStep(flow.steps[index], index);
}

console.log(`Flow complete: ${flow.id}`);
