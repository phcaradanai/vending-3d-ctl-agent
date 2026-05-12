/**
 * @file softwareIdentification.js
 *
 * Software configuration item (SCI) — **name**, **version**, and traceability hooks
 * aligned with **ISO/IEC 29110** (*Systems and software engineering — Lifecycle profiles
 * for Very Small Entities (VSEs)*):
 *
 * - **ISO/IEC 29110-4:2018** — Part 4: Profile specifications (*Basic profile*):
 *   configuration management expects a **unique product identifier** and a **version
 *   identifier** so builds/releases can be traced (e.g. support, regression analysis).
 * - **ISO/IEC 29110-5:2018** — Part 5: Software engineering — Management and engineering guide:
 *   engineering data (product identification) supports implementation and maintenance activities.
 *
 * **Version (release identifier):** `package.json` → `version` (use [semantic versioning](https://semver.org/), e.g. `1.2.3`).
 *
 * **Optional site / registry id:** environment variable `SOFTWARE_CI_ID` (configuration item id in your CMDB).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = path.resolve(__dirname, "../../package.json");

let _pkgCache;
function readPackageJson() {
  if (!_pkgCache) {
    _pkgCache = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  }
  return _pkgCache;
}

/**
 * @returns {{
 *   isoReference: string;
 *   lifecycleProfile: string;
 *   configurationItemId: string;
 *   name: string;
 *   version: string;
 *   description: string;
 *   license: string;
 * }}
 */
export function getSoftwareIdentification() {
  const pkg = readPackageJson();
  const envCi = String(process.env.SOFTWARE_CI_ID || "").trim();
  return {
    isoReference: "ISO/IEC 29110-4:2018 (Basic profile), ISO/IEC 29110-5:2018",
    lifecycleProfile: "Basic software engineering — configuration item identification & versioning",
    configurationItemId: envCi || `SCI-${pkg.name}`,
    name: pkg.name,
    version: pkg.version,
    description: String(pkg.description || "").trim() || "Vending 3-door control service (serial, SY600, MQTT).",
    license: pkg.license || "",
  };
}
