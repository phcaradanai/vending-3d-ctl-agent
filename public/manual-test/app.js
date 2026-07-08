const state = {
  catalog: { commands: [], flows: [] },
  activeCommandId: null,
  body: null,
  token: localStorage.getItem("manualTest.token") || "",
  baseUrl: localStorage.getItem("manualTest.baseUrl") || window.location.origin,
  history: JSON.parse(localStorage.getItem("manualTest.history") || "[]"),
  flowProgress: new Map(),
};

const els = {
  baseUrlInput: document.querySelector("#baseUrlInput"),
  tokenInput: document.querySelector("#tokenInput"),
  refreshHealthButton: document.querySelector("#refreshHealthButton"),
  commandList: document.querySelector("#commandList"),
  flowSelect: document.querySelector("#flowSelect"),
  runFlowButton: document.querySelector("#runFlowButton"),
  flowSteps: document.querySelector("#flowSteps"),
  activeCommandTitle: document.querySelector("#activeCommandTitle"),
  riskBadge: document.querySelector("#riskBadge"),
  ledBar: document.querySelector("#ledBar"),
  slotGrid: document.querySelector("#slotGrid"),
  liftTrack: document.querySelector("#liftTrack"),
  liftTargetLabel: document.querySelector("#liftTargetLabel"),
  queueStrip: document.querySelector("#queueStrip"),
  controlForm: document.querySelector("#controlForm"),
  requestMethod: document.querySelector("#requestMethod"),
  requestUrl: document.querySelector("#requestUrl"),
  bodyEditor: document.querySelector("#bodyEditor"),
  sendCommandButton: document.querySelector("#sendCommandButton"),
  resetBodyButton: document.querySelector("#resetBodyButton"),
  responseMeta: document.querySelector("#responseMeta"),
  responseOutput: document.querySelector("#responseOutput"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  historyList: document.querySelector("#historyList"),
  statusItems: {
    system: document.querySelector("#systemStatus"),
    vending: document.querySelector("#vendingStatus"),
    navigation: document.querySelector("#navigationStatus"),
    qr: document.querySelector("#qrStatus"),
    mqtt: document.querySelector("#mqttStatus"),
  },
};

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getActiveCommand() {
  return state.catalog.commands.find((command) => command.id === state.activeCommandId);
}

function getByPath(source, path) {
  return path.reduce((cursor, key) => (cursor === undefined || cursor === null ? undefined : cursor[key]), source);
}

function setByPath(source, path, value) {
  let cursor = source;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = typeof path[i + 1] === "number" ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

function pretty(value) {
  return value === null || value === undefined ? "" : JSON.stringify(value, null, 2);
}

function parseEditorBody() {
  const raw = els.bodyEditor.value.trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function normalizeBaseUrl() {
  return state.baseUrl.replace(/\/+$/, "");
}

function buildUrl(command) {
  return `${normalizeBaseUrl()}${command.endpoint}`;
}

function setStatusItem(element, label, stateName) {
  element.classList.remove("is-ok", "is-warn", "is-bad");
  element.classList.add(stateName);
  element.querySelector("strong").textContent = label;
}

function setUnknownStatuses() {
  Object.values(els.statusItems).forEach((element) => setStatusItem(element, "unknown", "is-warn"));
}

function renderCommandList() {
  const groups = new Map();
  for (const command of state.catalog.commands) {
    if (!groups.has(command.group)) groups.set(command.group, []);
    groups.get(command.group).push(command);
  }

  els.commandList.innerHTML = "";
  for (const [group, commands] of groups) {
    const wrapper = document.createElement("div");
    wrapper.className = "command-group";

    const title = document.createElement("div");
    title.className = "command-group-title";
    title.textContent = group;
    wrapper.append(title);

    for (const command of commands) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `command-button${command.id === state.activeCommandId ? " is-active" : ""}`;
      button.dataset.commandId = command.id;
      button.innerHTML = `<strong>${command.title}</strong><span>${command.method} ${command.endpoint}</span>`;
      button.addEventListener("click", () => selectCommand(command.id));
      wrapper.append(button);
    }
    els.commandList.append(wrapper);
  }
}

function renderFlowSelect() {
  els.flowSelect.innerHTML = "";
  for (const flow of state.catalog.flows) {
    const option = document.createElement("option");
    option.value = flow.id;
    option.textContent = flow.title;
    els.flowSelect.append(option);
  }
  renderFlowSteps();
}

function renderFlowSteps() {
  const flow = state.catalog.flows.find((item) => item.id === els.flowSelect.value);
  els.flowSteps.innerHTML = "";
  if (!flow) return;
  flow.steps.forEach((step, index) => {
    const command = state.catalog.commands.find((item) => item.id === step.commandId);
    const row = document.createElement("div");
    row.className = `flow-step ${state.flowProgress.get(index) || ""}`.trim();
    row.innerHTML = `<b>${index + 1}</b><span>${command?.title || step.commandId}</span>`;
    els.flowSteps.append(row);
  });
}

function renderLedBar(command, body) {
  const focus = command?.focus || {};
  const ledStart = focus.ledStartPath ? Number(getByPath(body, focus.ledStartPath)) : null;
  const ledEnd = focus.ledEndPath ? Number(getByPath(body, focus.ledEndPath)) : null;

  els.ledBar.innerHTML = "";
  for (let i = 0; i < 24; i += 1) {
    const start = Math.floor((i / 24) * 165) + 1;
    const end = Math.floor(((i + 1) / 24) * 165);
    const segment = document.createElement("div");
    segment.className = "led-segment";
    segment.title = `LED ${start}-${end}`;
    if (focus.area === "navigationLights" && ledStart <= end && ledEnd >= start) {
      segment.classList.add("is-focus");
    }
    segment.addEventListener("click", () => {
      if (!focus.ledStartPath || !focus.ledEndPath) return;
      const nextBody = parseEditorBody();
      setByPath(nextBody, focus.ledStartPath, start);
      setByPath(nextBody, focus.ledEndPath, end);
      updateBody(nextBody);
    });
    els.ledBar.append(segment);
  }
}

function renderSlotGrid(command, body) {
  const focus = command?.focus || {};
  const layer = focus.layerPath ? Number(getByPath(body, focus.layerPath)) : null;
  const channelStart = focus.channelStartPath ? Number(getByPath(body, focus.channelStartPath)) : null;
  const channelEnd = focus.channelEndPath ? Number(getByPath(body, focus.channelEndPath)) : channelStart;

  els.slotGrid.innerHTML = "";
  for (let row = 1; row <= 7; row += 1) {
    const label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = `L${row}`;
    els.slotGrid.append(label);

    for (let channel = 0; channel < 10; channel += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "slot-cell";
      cell.textContent = channel;
      cell.title = `Layer ${row}, channel ${channel}`;
      if (focus.area === "slots" && (!layer || layer === row) && channel >= channelStart && channel <= channelEnd) {
        cell.classList.add("is-focus");
      }
      cell.addEventListener("click", () => {
        if (!focus.channelStartPath && !focus.channelEndPath) return;
        const nextBody = parseEditorBody();
        if (focus.layerPath) setByPath(nextBody, focus.layerPath, row);
        if (focus.channelStartPath) setByPath(nextBody, focus.channelStartPath, channel);
        if (focus.channelEndPath) setByPath(nextBody, focus.channelEndPath, channel);
        updateBody(nextBody);
      });
      els.slotGrid.append(cell);
    }
  }
}

function renderDoorFocus(command, body) {
  const focus = command?.focus || {};
  document.querySelectorAll(".door").forEach((door) => door.classList.remove("is-focus"));
  document.querySelectorAll(".subsystem").forEach((item) => item.classList.remove("is-focus"));

  const doorNo = focus.doorPath ? Number(getByPath(body, focus.doorPath)) : null;
  if (doorNo) {
    document.querySelector(`.door[data-door="${doorNo}"]`)?.classList.add("is-focus");
  }

  const areaMap = {
    sensors: "#sensorFocus",
    cabinetLights: "#cabinetLightFocus",
    compressor: "#compressorFocus",
  };
  if (areaMap[focus.area]) {
    document.querySelector(areaMap[focus.area])?.classList.add("is-focus");
  }
}

function renderLiftFocus(command, body) {
  const focus = command?.focus || {};
  els.liftTrack.classList.toggle("is-focus", focus.area === "lift");
  const target = focus.targetPath ? getByPath(body, focus.targetPath) : "-";
  els.liftTargetLabel.textContent = target ?? "-";
}

function renderMachine() {
  const command = getActiveCommand();
  let body = state.body;
  try {
    body = parseEditorBody();
  } catch {
    body = state.body;
  }
  renderLedBar(command, body || {});
  renderSlotGrid(command, body || {});
  renderDoorFocus(command, body || {});
  renderLiftFocus(command, body || {});
}

function renderControls() {
  const command = getActiveCommand();
  els.controlForm.innerHTML = "";
  if (!command) return;

  for (const control of command.controls) {
    const label = document.createElement("label");
    label.className = "field";
    const text = document.createElement("span");
    text.textContent = control.label;
    label.append(text);

    const value = getByPath(state.body, control.path);
    let input;
    if (control.type === "select") {
      input = document.createElement("select");
      for (const option of control.options) {
        const item = document.createElement("option");
        item.value = String(option.value);
        item.textContent = option.label;
        if (String(option.value) === String(value)) item.selected = true;
        input.append(item);
      }
    } else if (control.type === "boolean") {
      input = document.createElement("select");
      for (const option of [
        { value: "true", label: "On / true" },
        { value: "false", label: "Off / false" },
      ]) {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        if (String(value) === option.value) item.selected = true;
        input.append(item);
      }
    } else {
      input = document.createElement("input");
      input.type = control.type === "number" ? "number" : "text";
      if (control.min !== undefined) input.min = control.min;
      if (control.max !== undefined) input.max = control.max;
      input.value = value ?? "";
      input.spellcheck = false;
      if (control.placeholder) input.placeholder = control.placeholder;
    }

    input.addEventListener("input", () => {
      const nextBody = parseEditorBody() ?? {};
      let nextValue = input.value;
      if (control.type === "number" || control.type === "select") {
        const option = control.options?.find((item) => String(item.value) === input.value);
        nextValue = option ? option.value : Number(input.value);
      }
      if (control.type === "boolean") {
        nextValue = input.value === "true";
      }
      setByPath(nextBody, control.path, nextValue);
      updateBody(nextBody);
    });

    label.append(input);
    els.controlForm.append(label);
  }
}

function updateBody(nextBody) {
  state.body = clone(nextBody);
  els.bodyEditor.value = pretty(state.body);
  renderControls();
  renderMachine();
}

function selectCommand(commandId) {
  const command = state.catalog.commands.find((item) => item.id === commandId);
  if (!command) return;
  state.activeCommandId = command.id;
  state.body = clone(command.defaultBody);
  els.activeCommandTitle.textContent = command.title;
  els.riskBadge.textContent = command.risk;
  els.riskBadge.classList.toggle("is-danger", command.risk.includes("hardware"));
  els.riskBadge.classList.toggle("is-read", command.risk.includes("read"));
  els.requestMethod.textContent = command.method;
  els.requestUrl.textContent = command.endpoint;
  els.bodyEditor.value = pretty(state.body);
  els.bodyEditor.disabled = command.defaultBody === null;
  renderCommandList();
  renderControls();
  renderMachine();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
  document.querySelector(`#${tabName}Tab`)?.classList.add("is-active");
}

function saveSettings() {
  state.baseUrl = els.baseUrlInput.value.trim() || window.location.origin;
  state.token = els.tokenInput.value.trim();
  localStorage.setItem("manualTest.baseUrl", state.baseUrl);
  localStorage.setItem("manualTest.token", state.token);
}

function saveHistory() {
  localStorage.setItem("manualTest.history", JSON.stringify(state.history.slice(0, 60)));
}

function addHistory(entry) {
  state.history.unshift(entry);
  state.history = state.history.slice(0, 60);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  els.historyList.innerHTML = "";
  for (const entry of state.history) {
    const item = document.createElement("article");
    item.className = `history-item${entry.ok ? "" : " is-error"}`;
    item.innerHTML = `
      <header><strong>${entry.method} ${entry.endpoint}</strong><span>${entry.status} ${entry.ms}ms</span></header>
      <p>${entry.title}</p>
    `;
    item.addEventListener("click", () => {
      els.responseMeta.textContent = `${entry.status} ${entry.statusText || ""} / ${entry.ms}ms / ${entry.time}`;
      els.responseOutput.textContent = pretty(entry.response);
      switchTab("response");
    });
    els.historyList.append(item);
  }
}

function getRequestBody(command, explicitBody) {
  if (command.method === "GET") return null;
  if (explicitBody !== undefined) return clone(explicitBody);
  return parseEditorBody();
}

async function sendCommand(command = getActiveCommand(), explicitBody, options = {}) {
  if (!command) return null;
  saveSettings();

  const requestBody = getRequestBody(command, explicitBody);
  if (command.protected && !state.token) {
    const proceed = window.confirm("Protected API ต้องใช้ Bearer token. ส่งต่อโดยไม่มี token?");
    if (!proceed) return null;
  }

  if (!options.skipConfirm && command.risk.includes("hardware")) {
    const proceed = window.confirm(`คำสั่งนี้กระทบ hardware: ${command.title}\nส่งจริงไปที่ ${command.endpoint}?`);
    if (!proceed) return null;
  }

  const headers = { Accept: "application/json" };
  if (command.method !== "GET") headers["Content-Type"] = "application/json";
  if (command.protected && state.token) headers.Authorization = `Bearer ${state.token}`;

  const startedAt = performance.now();
  const startedTime = new Date().toLocaleTimeString();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 130000);

  const requestSummary = {
    method: command.method,
    url: buildUrl(command),
    headers: { ...headers, Authorization: headers.Authorization ? "Bearer ***" : undefined },
    body: requestBody,
  };
  els.responseMeta.textContent = `Sending ${command.method} ${command.endpoint}`;
  els.responseOutput.textContent = pretty(requestSummary);
  switchTab("response");

  try {
    const response = await fetch(buildUrl(command), {
      method: command.method,
      headers,
      body: command.method === "GET" ? undefined : JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const ms = Math.round(performance.now() - startedAt);
    const ok = response.ok;
    const entry = {
      ok,
      title: command.title,
      method: command.method,
      endpoint: command.endpoint,
      status: response.status,
      statusText: response.statusText,
      ms,
      time: startedTime,
      request: requestSummary,
      response: data,
    };
    addHistory(entry);
    els.responseMeta.textContent = `${response.status} ${response.statusText} / ${ms}ms / ${startedTime}`;
    els.responseOutput.textContent = pretty(data);
    if (command.id === "health" && data && typeof data === "object") updateHealthStatus(data);
    if (command.id === "jobQueue" && data && typeof data === "object") updateQueueStatus(data);
    return entry;
  } catch (error) {
    const ms = Math.round(performance.now() - startedAt);
    const entry = {
      ok: false,
      title: command.title,
      method: command.method,
      endpoint: command.endpoint,
      status: "ERR",
      statusText: error.name,
      ms,
      time: startedTime,
      request: requestSummary,
      response: { error: error.message },
    };
    addHistory(entry);
    els.responseMeta.textContent = `ERR ${error.name} / ${ms}ms / ${startedTime}`;
    els.responseOutput.textContent = pretty(entry.response);
    return entry;
  } finally {
    window.clearTimeout(timeout);
  }
}

function updateHealthStatus(data) {
  const channels = data.devices?.serial?.channels || {};
  const mqtt = data.devices?.mqtt || {};
  setStatusItem(els.statusItems.system, data.summary?.systemStatus || data.status || "unknown", data.status === "ok" ? "is-ok" : "is-warn");
  setStatusItem(
    els.statusItems.vending,
    channels.vending?.serialReady ? "connected" : "down",
    channels.vending?.serialReady ? "is-ok" : "is-bad"
  );
  setStatusItem(
    els.statusItems.navigation,
    channels.navigationLights?.serialReady ? "connected" : "down",
    channels.navigationLights?.serialReady ? "is-ok" : "is-bad"
  );
  setStatusItem(
    els.statusItems.qr,
    channels.qrNfc?.serialReady ? "connected" : "down",
    channels.qrNfc?.serialReady ? "is-ok" : "is-bad"
  );
  if (!mqtt.enabled) {
    setStatusItem(els.statusItems.mqtt, "disabled", "is-warn");
  } else {
    setStatusItem(els.statusItems.mqtt, mqtt.isConnected ? "connected" : "down", mqtt.isConnected ? "is-ok" : "is-bad");
  }
  updateQueueStatus(data.devices?.serial?.writeQueues || data.writeQueues || {});
}

function updateQueueStatus(data) {
  const queues = data.writeQueues || data;
  const queueValues = Object.values(queues || {}).filter((item) => item && typeof item === "object");
  const waiting = queueValues.reduce((sum, item) => sum + Number(item.waitingJobs || 0), 0);
  const running = queueValues.filter((item) => item.runningJob || item.busy).length;
  els.queueStrip.innerHTML = `<span>Queue</span><strong>waiting: ${waiting}</strong><strong>running: ${running}</strong>`;
}

async function refreshHealth() {
  const command = state.catalog.commands.find((item) => item.id === "health");
  if (!command) return;
  try {
    saveSettings();
    const response = await fetch(buildUrl(command), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    updateHealthStatus(data);
  } catch {
    setUnknownStatuses();
  }
}

async function runFlow() {
  const flow = state.catalog.flows.find((item) => item.id === els.flowSelect.value);
  if (!flow) return;
  if (flow.requiresExecuteConfirmation) {
    const proceed = window.confirm(`Flow นี้ส่งคำสั่ง hardware จริง: ${flow.title}\nตรวจเครื่องและพื้นที่ทดสอบแล้ว?`);
    if (!proceed) return;
  }

  state.flowProgress = new Map();
  renderFlowSteps();
  els.runFlowButton.disabled = true;

  for (let index = 0; index < flow.steps.length; index += 1) {
    const step = flow.steps[index];
    const command = state.catalog.commands.find((item) => item.id === step.commandId);
    if (!command) continue;

    state.flowProgress.set(index, "is-running");
    renderFlowSteps();
    selectCommand(command.id);
    if (step.body !== undefined) updateBody(step.body);
    const result = await sendCommand(command, step.body, { skipConfirm: true });
    state.flowProgress.set(index, result?.ok ? "is-done" : "is-failed");
    renderFlowSteps();
    if (!result?.ok) break;
  }

  els.runFlowButton.disabled = false;
}

function attachEvents() {
  els.baseUrlInput.value = state.baseUrl;
  els.tokenInput.value = state.token;

  els.baseUrlInput.addEventListener("change", saveSettings);
  els.tokenInput.addEventListener("change", saveSettings);
  els.refreshHealthButton.addEventListener("click", refreshHealth);
  els.sendCommandButton.addEventListener("click", () => sendCommand());
  els.resetBodyButton.addEventListener("click", () => {
    const command = getActiveCommand();
    if (command) updateBody(command.defaultBody);
  });
  els.bodyEditor.addEventListener("input", () => {
    try {
      state.body = parseEditorBody();
      renderControls();
      renderMachine();
    } catch {
      // Keep raw editor text while invalid JSON is being typed.
    }
  });
  els.clearHistoryButton.addEventListener("click", () => {
    state.history = [];
    saveHistory();
    renderHistory();
  });
  els.flowSelect.addEventListener("change", () => {
    state.flowProgress = new Map();
    renderFlowSteps();
  });
  els.runFlowButton.addEventListener("click", runFlow);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  document.querySelectorAll(".door").forEach((door) =>
    door.addEventListener("click", () => {
      const command = getActiveCommand();
      const focus = command?.focus || {};
      if (!focus.doorPath) return;
      const nextBody = parseEditorBody();
      setByPath(nextBody, focus.doorPath, Number(door.dataset.door));
      updateBody(nextBody);
    })
  );
}

async function init() {
  attachEvents();
  setUnknownStatuses();
  renderHistory();

  const response = await fetch("/manual-test/commands.json");
  state.catalog = await response.json();
  state.activeCommandId = state.catalog.commands[0]?.id || null;
  renderCommandList();
  renderFlowSelect();
  selectCommand(state.activeCommandId);
  await refreshHealth();
  window.setInterval(refreshHealth, 15000);
}

init().catch((error) => {
  els.responseMeta.textContent = "UI init failed";
  els.responseOutput.textContent = pretty({ error: error.message });
  switchTab("response");
});
