import { LED_MAX, ledIndexAt } from "./ledMatrix.js?v=20260730-1";

const GROUP_ICONS = {
  Status: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  "Raw serial": '<path d="M4 5h16v14H4z"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/>',
  "Navigation lights": '<circle cx="12" cy="10" r="5"/><path d="M9 21h6"/><path d="M10 18h4"/>',
  SY600: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  "SY600 reads": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  Cabinet: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16"/><circle cx="8" cy="7.5" r=".6" fill="currentColor"/><circle cx="8" cy="16.5" r=".6" fill="currentColor"/>',
  "Vending flow": '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
};
const DEFAULT_ICON = '<circle cx="12" cy="12" r="8"/>';

const RISK_ICONS = {
  read: '<circle cx="12" cy="12" r="7"/>',
  "read-via-serial": '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  "hardware-write": '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none"/>',
  "hardware-motion": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
};

function iconSvg(markup, extraClass) {
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ""}" viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value, min, max) {
  let next = value;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

function readStoredInt(key, fallback, min, max) {
  return clampInt(localStorage.getItem(key), min, max, fallback);
}

const state = {
  catalog: { commands: [], flows: [] },
  activeCommandId: null,
  body: null,
  token: localStorage.getItem("manualTest.token") || "",
  baseUrl: localStorage.getItem("manualTest.baseUrl") || window.location.origin,
  history: JSON.parse(localStorage.getItem("manualTest.history") || "[]"),
  flowProgress: new Map(),
  gridRows: readStoredInt("manualTest.gridRows", 5, 1, 20),
  gridCols: readStoredInt("manualTest.gridCols", 22, 1, 40),
  ledRows: readStoredInt("manualTest.ledRows", 5, 1, 20),
  ledCols: readStoredInt("manualTest.ledCols", 22, 1, 40),
};

const els = {
  baseUrlInput: document.querySelector("#baseUrlInput"),
  tokenInput: document.querySelector("#tokenInput"),
  refreshHealthButton: document.querySelector("#refreshHealthButton"),
  commandIcons: document.querySelector("#commandIcons"),
  flowSelect: document.querySelector("#flowSelect"),
  runFlowButton: document.querySelector("#runFlowButton"),
  flowSteps: document.querySelector("#flowSteps"),
  activeCommandTitle: document.querySelector("#activeCommandTitle"),
  riskBadge: document.querySelector("#riskBadge"),
  ledBar: document.querySelector("#ledBar"),
  ledRangeLabel: document.querySelector("#ledRangeLabel"),
  ledHint: document.querySelector("#ledHint"),
  ledRowsInput: document.querySelector("#ledRowsInput"),
  ledColsInput: document.querySelector("#ledColsInput"),
  slotGrid: document.querySelector("#slotGrid"),
  slotHint: document.querySelector("#slotHint"),
  slotHeaderLabel: document.querySelector("#slotHeaderLabel"),
  gridRowsInput: document.querySelector("#gridRowsInput"),
  gridColsInput: document.querySelector("#gridColsInput"),
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
  ioDrawer: document.querySelector("#ioDrawer"),
  ioDrawerToggle: document.querySelector("#ioDrawerToggle"),
  ioDrawerStatus: document.querySelector("#ioDrawerStatus"),
  ioDrawerClose: document.querySelector("#ioDrawerClose"),
  commandTooltip: document.querySelector("#commandTooltip"),
  slotPopover: document.querySelector("#slotPopover"),
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

// Body as the editor currently shows it, falling back to the last valid state so
// a half-typed JSON edit never wipes the body being built.
function currentBody() {
  try {
    return parseEditorBody();
  } catch {
    return state.body;
  }
}

function normalizeBaseUrl() {
  return state.baseUrl.replace(/\/+$/, "");
}

function buildUrl(command) {
  return `${normalizeBaseUrl()}${command.endpoint}`;
}

function isSlotActionable(command) {
  const focus = command?.focus || {};
  return focus.area === "slots" && Boolean(focus.channelStartPath || focus.channelEndPath);
}

function setStatusItem(element, label, stateName) {
  element.classList.remove("is-ok", "is-warn", "is-bad");
  element.classList.add(stateName);
  element.querySelector("strong").textContent = label;
}

function setUnknownStatuses() {
  Object.values(els.statusItems).forEach((element) => setStatusItem(element, "unknown", "is-warn"));
}

function renderCommandIcons() {
  els.commandIcons.innerHTML = "";
  let lastGroup = null;
  for (const command of state.catalog.commands) {
    if (command.group !== lastGroup) {
      const divider = document.createElement("div");
      divider.className = "command-group-divider";
      divider.setAttribute("aria-hidden", "true");
      if (lastGroup !== null) els.commandIcons.append(divider);
      lastGroup = command.group;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.className = `command-icon-button${command.id === state.activeCommandId ? " is-active" : ""}`;
    button.dataset.commandId = command.id;
    button.setAttribute("aria-label", `${command.title} — ${command.method} ${command.endpoint}`);
    button.innerHTML = `${iconSvg(GROUP_ICONS[command.group] || DEFAULT_ICON)}${iconSvg(RISK_ICONS[command.risk] || "", "icon-risk")}`;
    button.addEventListener("click", () => selectCommand(command.id));
    button.addEventListener("pointerenter", () => showCommandTooltip(button, command));
    button.addEventListener("focus", () => showCommandTooltip(button, command));
    button.addEventListener("pointerleave", hideCommandTooltip);
    button.addEventListener("blur", hideCommandTooltip);
    els.commandIcons.append(button);
  }
}

let tooltipShowTimer = null;
let tooltipAnchor = null;

function showCommandTooltip(anchorEl, command) {
  window.clearTimeout(tooltipShowTimer);
  tooltipAnchor = anchorEl;
  tooltipShowTimer = window.setTimeout(() => {
    if (tooltipAnchor !== anchorEl) return;
    els.commandTooltip.innerHTML = `
      <strong>${command.title}</strong>
      <span>${command.method} ${command.endpoint}</span>
      <p>${command.description}</p>
    `;
    els.commandTooltip.hidden = false;
    const anchorRect = anchorEl.getBoundingClientRect();
    const tipRect = els.commandTooltip.getBoundingClientRect();
    let left = anchorRect.right + 10;
    if (left + tipRect.width > window.innerWidth - 8) {
      left = anchorRect.left - tipRect.width - 10;
    }
    let top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
    top = Math.min(Math.max(8, top), window.innerHeight - tipRect.height - 8);
    els.commandTooltip.style.left = `${left}px`;
    els.commandTooltip.style.top = `${top}px`;
  }, 120);
}

function hideCommandTooltip() {
  window.clearTimeout(tooltipShowTimer);
  tooltipAnchor = null;
  els.commandTooltip.hidden = true;
}

// Safety net: pointerenter/pointerleave can miss transitions during fast
// mouse movement or re-renders mid-hover, leaving a stale tooltip on screen.
// Re-verify on every pointer move, scroll, or click that the pointer is
// still actually over the anchoring button.
document.addEventListener(
  "pointermove",
  (event) => {
    if (!tooltipAnchor) return;
    if (event.target.closest(".command-icon-button") === tooltipAnchor) return;
    hideCommandTooltip();
  },
  { passive: true }
);
document.addEventListener("scroll", hideCommandTooltip, { capture: true, passive: true });
document.addEventListener("pointerdown", hideCommandTooltip);
window.addEventListener("blur", hideCommandTooltip);

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

// The LED panel renders the physical wiring (see ledMatrix.js): LED 1 at the
// bottom-left, every row restarting at the left edge. Rendering that instead of
// one flat bar is what makes a LED range on screen match the machine standing in
// front of the tester.
function isLedActionable(command) {
  const focus = command?.focus || {};
  return focus.area === "navigationLights" && Boolean(focus.ledStartPath && focus.ledEndPath);
}

function readLedRange(command, body) {
  const focus = command?.focus || {};
  if (focus.area !== "navigationLights") return null;
  const start = focus.ledStartPath ? Number(getByPath(body, focus.ledStartPath)) : NaN;
  const end = focus.ledEndPath ? Number(getByPath(body, focus.ledEndPath)) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { from: Math.min(start, end), to: Math.max(start, end) };
}

function ledColor(command, body) {
  const focus = command?.focus || {};
  if (focus.area !== "navigationLights" || !focus.ledStartPath) return null;
  // RGB lives in the three slots after the LED range on the same cmd array.
  const base = focus.ledStartPath.slice(0, -1);
  const index = Number(focus.ledStartPath[focus.ledStartPath.length - 1]);
  if (!Number.isFinite(index)) return null;
  const channels = [2, 3, 4].map((offset) => Number(getByPath(body, [...base, index + offset])));
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  const [r, g, b] = channels.map((channel) => clampNumber(Math.round(channel), 0, 255));
  return `rgb(${r} ${g} ${b})`;
}

function ledCoverage() {
  return state.ledRows * state.ledCols;
}

function paintLedRange(range) {
  const covered = ledCoverage();
  const cells = els.ledBar.querySelectorAll(".led-cell");
  cells.forEach((cell) => {
    const index = Number(cell.dataset.ledIndex);
    const lit = Boolean(range) && index >= range.from && index <= range.to && index <= LED_MAX;
    cell.classList.toggle("is-focus", lit);
  });

  if (!range) {
    els.ledRangeLabel.textContent = "no LED range";
    return;
  }
  // A matrix smaller than the strip cannot show the whole range. Say so, or an
  // unlit panel reads as a dead click instead of a coverage gap.
  let suffix = "";
  if (range.from > covered) suffix = " · off panel";
  else if (range.to > covered) suffix = ` · shown to ${covered}`;
  els.ledRangeLabel.textContent = `LED ${range.from}-${range.to}${suffix}`;
}

function renderLedPanel(command, body) {
  const actionable = isLedActionable(command);
  const range = readLedRange(command, body);
  const color = ledColor(command, body);

  els.ledBar.style.setProperty("--led-cols", state.ledCols);
  els.ledBar.style.setProperty("--led-color", color || "var(--warn)");
  els.ledBar.classList.toggle("is-actionable", actionable);
  const covered = ledCoverage();
  const coverageNote =
    covered < LED_MAX
      ? ` Matrix covers LED 1-${covered} of ${LED_MAX} — raise R/C to reach the rest.`
      : "";
  els.ledHint.textContent =
    (actionable
      ? "Click an LED to target it. Drag or Shift-click for a range. LED 1 = bottom-left, every row runs left to right."
      : "Select a navigation-light command to target LEDs. LED 1 = bottom-left, every row runs left to right.") +
    coverageNote;

  els.ledBar.innerHTML = "";
  for (let row = state.ledRows; row >= 1; row -= 1) {
    const label = document.createElement("div");
    label.className = "led-row-label";
    label.textContent = `${row} →`;
    label.title = `Row ${row} from the bottom, wired left to right from LED ${ledIndexAt(row, 1, state.ledCols)}`;
    els.ledBar.append(label);

    for (let col = 1; col <= state.ledCols; col += 1) {
      const index = ledIndexAt(row, col, state.ledCols);
      const overflow = index > LED_MAX;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.dataset.ledIndex = index;
      cell.className = `led-cell${overflow ? " is-overflow" : actionable ? " is-actionable" : " is-inert"}`;
      cell.textContent = index;
      cell.disabled = overflow;
      cell.setAttribute(
        "aria-label",
        overflow
          ? `LED ${index} is past the ${LED_MAX} LED strip`
          : `LED ${index}, row ${row} from bottom, column ${col} from left`
      );
      els.ledBar.append(cell);
    }
  }

  paintLedRange(range);
}

let ledDragAnchor = null;
let ledDragIndex = null;

function applyLedRange(from, to) {
  const command = getActiveCommand();
  if (!isLedActionable(command)) return;
  const focus = command.focus;
  const nextBody = currentBody() ?? clone(command.defaultBody) ?? {};
  setByPath(nextBody, focus.ledStartPath, Math.min(from, to));
  setByPath(nextBody, focus.ledEndPath, Math.max(from, to));
  updateBody(nextBody);
}

function ledIndexFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest?.(".led-cell.is-actionable");
  return cell ? Number(cell.dataset.ledIndex) : null;
}

function attachLedEvents() {
  els.ledBar.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".led-cell.is-actionable");
    if (!cell) return;
    event.preventDefault();
    const index = Number(cell.dataset.ledIndex);
    if (event.shiftKey) {
      const range = readLedRange(getActiveCommand(), currentBody() || {});
      applyLedRange(range ? range.from : index, index);
      return;
    }
    ledDragAnchor = index;
    ledDragIndex = index;
    // Paint only while dragging; the body is written once on pointerup so a
    // drag does not fire a re-render (and DOM rebuild) per cell crossed.
    paintLedRange({ from: index, to: index });
  });

  document.addEventListener("pointermove", (event) => {
    if (ledDragAnchor === null) return;
    const index = ledIndexFromPoint(event.clientX, event.clientY);
    if (index === null || index === ledDragIndex) return;
    ledDragIndex = index;
    paintLedRange({ from: Math.min(ledDragAnchor, index), to: Math.max(ledDragAnchor, index) });
  });

  document.addEventListener("pointerup", () => {
    if (ledDragAnchor === null) return;
    const anchor = ledDragAnchor;
    const index = ledDragIndex ?? anchor;
    ledDragAnchor = null;
    ledDragIndex = null;
    applyLedRange(anchor, index);
  });

  document.addEventListener("pointercancel", () => {
    ledDragAnchor = null;
    ledDragIndex = null;
    renderMachine();
  });
}

function renderSlotGrid(command, body) {
  const focus = command?.focus || {};
  const actionable = isSlotActionable(command);
  // Only worth saying on a slot-focused command whose cells do nothing; on
  // unrelated commands the dimmed grid already says enough.
  els.slotHint.hidden = !(focus.area === "slots" && !actionable);
  els.slotHeaderLabel.textContent = `Layer × channel 0-${state.gridCols - 1}`;

  const rawLayer = focus.layerPath ? Number(getByPath(body, focus.layerPath)) : null;
  const rawChannelStart = focus.channelStartPath ? Number(getByPath(body, focus.channelStartPath)) : null;
  const rawChannelEnd = focus.channelEndPath ? Number(getByPath(body, focus.channelEndPath)) : rawChannelStart;

  const layer = rawLayer !== null ? rawLayer - (focus.layerOffset ?? 0) : null;
  const channelStart = rawChannelStart !== null ? rawChannelStart - (focus.channelOffset ?? 0) : null;
  const channelEnd = rawChannelEnd !== null ? rawChannelEnd - (focus.channelOffset ?? 0) : null;

  els.slotGrid.style.setProperty("--grid-cols", state.gridCols);
  els.slotGrid.style.setProperty("--grid-rows", state.gridRows);
  els.slotGrid.innerHTML = "";
  for (let row = 1; row <= state.gridRows; row += 1) {
    const label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = `L${row}`;
    els.slotGrid.append(label);

    for (let channel = 0; channel < state.gridCols; channel += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `slot-cell${actionable ? " is-actionable" : " is-inert"}`;
      cell.textContent = channel;
      cell.setAttribute("aria-label", `Layer ${row}, channel ${channel}`);
      if (focus.area === "slots" && (!layer || layer === row) && channel >= channelStart && channel <= channelEnd) {
        cell.classList.add("is-focus");
      }
      cell.addEventListener("click", () => {
        if (!actionable) return;
        openSlotPopover(cell, row, channel, command);
      });
      els.slotGrid.append(cell);
    }
  }
  scheduleSlotGridSync();
}

let slotGridResizeObserver = null;
let slotGridSyncFrame = 0;

function syncSlotGridRows() {
  const rowCount = Math.max(1, state.gridRows);
  const styles = window.getComputedStyle(els.slotGrid);
  const rowGap = Number.parseFloat(styles.rowGap) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const availableHeight = els.slotGrid.clientHeight - paddingTop - paddingBottom - rowGap * (rowCount - 1);

  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    els.slotGrid.style.removeProperty("--machine-slot-row-height");
    return;
  }

  const minRowHeight = Number.parseFloat(styles.getPropertyValue("--machine-slot-min-row")) || 20;
  const rowHeight = Math.max(minRowHeight, Math.floor(availableHeight / rowCount));
  els.slotGrid.style.setProperty("--machine-slot-row-height", `${rowHeight}px`);
}

function scheduleSlotGridSync() {
  window.cancelAnimationFrame(slotGridSyncFrame);
  slotGridSyncFrame = window.requestAnimationFrame(() => {
    syncSlotGridRows();
    slotGridSyncFrame = window.requestAnimationFrame(syncSlotGridRows);
  });
}

function observeSlotGridSize() {
  if (slotGridResizeObserver) return;

  if ("ResizeObserver" in window) {
    slotGridResizeObserver = new ResizeObserver(scheduleSlotGridSync);
    slotGridResizeObserver.observe(els.slotGrid);
  }

  window.addEventListener("resize", scheduleSlotGridSync, { passive: true });
  scheduleSlotGridSync();
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
  const body = currentBody();
  renderLedPanel(command, body || {});
  renderSlotGrid(command, body || {});
  renderDoorFocus(command, body || {});
  renderLiftFocus(command, body || {});
}

// Live bindings for the inputs currently in the form. The form is rebuilt only
// when the active command changes; every other update writes values into these
// existing inputs (see syncControls), so typing never destroys the field under
// the caret.
let controlBindings = [];

function commitControl(control, input, { live }) {
  const raw = input.value;
  const nextBody = currentBody() ?? {};

  if (control.type === "number") {
    if (raw.trim() === "") {
      // An empty field is a keystroke on the way to a new number, not a zero.
      // Leave the body untouched until the field is committed.
      if (live) return;
      const fallback = control.min ?? 0;
      input.value = String(fallback);
      setByPath(nextBody, control.path, fallback);
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      // Clamp on commit only: clamping mid-typing rewrites the field and makes
      // values like 0 impossible to reach on a min-1 control.
      const value = live ? parsed : clampNumber(parsed, control.min, control.max);
      if (!live && value !== parsed) input.value = String(value);
      setByPath(nextBody, control.path, value);
    }
  } else if (control.type === "select") {
    const option = control.options?.find((item) => String(item.value) === raw);
    setByPath(nextBody, control.path, option ? option.value : raw);
  } else if (control.type === "boolean") {
    setByPath(nextBody, control.path, raw === "true");
  } else {
    setByPath(nextBody, control.path, raw);
  }

  updateBody(nextBody);
}

function syncControls() {
  for (const { control, input } of controlBindings) {
    if (input === document.activeElement) continue;
    const value = getByPath(state.body, control.path);
    if (control.type === "boolean") {
      input.value = String(Boolean(value));
    } else if (control.type === "select") {
      input.value = String(value);
    } else {
      input.value = value ?? "";
    }
  }
}

function buildControls() {
  const command = getActiveCommand();
  els.controlForm.innerHTML = "";
  controlBindings = [];
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
      if (control.type === "number") input.step = 1;
      if (control.min !== undefined) input.min = control.min;
      if (control.max !== undefined) input.max = control.max;
      input.value = value ?? "";
      input.spellcheck = false;
      if (control.placeholder) input.placeholder = control.placeholder;
    }

    input.addEventListener("input", () => commitControl(control, input, { live: true }));
    if (control.type === "number") {
      input.addEventListener("change", () => commitControl(control, input, { live: false }));
      input.addEventListener("blur", () => commitControl(control, input, { live: false }));
    }

    label.append(input);
    els.controlForm.append(label);
    controlBindings.push({ control, input });
  }
}

function updateBody(nextBody) {
  state.body = clone(nextBody);
  if (document.activeElement !== els.bodyEditor) els.bodyEditor.value = pretty(state.body);
  syncControls();
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
  renderCommandIcons();
  buildControls();
  renderMachine();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
  document.querySelector(`#${tabName}Tab`)?.classList.add("is-active");
}

function openDrawer(tabName) {
  els.ioDrawer.classList.add("is-open");
  els.ioDrawer.setAttribute("aria-hidden", "false");
  els.ioDrawerToggle.setAttribute("aria-expanded", "true");
  els.ioDrawerToggle.hidden = true;
  if (tabName) switchTab(tabName);
}

function closeDrawer() {
  els.ioDrawer.classList.remove("is-open");
  els.ioDrawer.setAttribute("aria-hidden", "true");
  els.ioDrawerToggle.setAttribute("aria-expanded", "false");
  els.ioDrawerToggle.hidden = false;
}

function toggleDrawer() {
  if (els.ioDrawer.classList.contains("is-open")) closeDrawer();
  else openDrawer();
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
      openDrawer("response");
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

  let requestBody;
  try {
    requestBody = getRequestBody(command, explicitBody);
  } catch (error) {
    // Invalid JSON in the editor used to reject silently and look like a dead
    // Send button; report it in the drawer instead.
    els.responseMeta.textContent = "Request body is not valid JSON";
    els.responseOutput.textContent = pretty({ error: error.message });
    els.ioDrawerStatus.textContent = "Invalid JSON";
    els.ioDrawerToggle.classList.add("is-error");
    openDrawer("response");
    return null;
  }

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
  els.ioDrawerStatus.textContent = "Sending…";
  openDrawer("response");

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
    els.ioDrawerStatus.textContent = `${response.status} · ${ms}ms`;
    els.ioDrawerToggle.classList.toggle("is-error", !ok);
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
    els.ioDrawerStatus.textContent = `ERR ${error.name}`;
    els.ioDrawerToggle.classList.add("is-error");
    return entry;
  } finally {
    window.clearTimeout(timeout);
  }
}

function hideSlotPopover() {
  if (els.slotPopover.matches(":popover-open")) els.slotPopover.hidePopover();
}

function openSlotPopover(cellEl, row, channel, command) {
  const focus = command.focus || {};
  els.slotPopover.innerHTML = `
    <p class="slot-popover-title">Slot ${channel} · Floor ${row}</p>
    <p class="slot-popover-body">About to run <strong>${command.title}</strong>. Confirm to send.</p>
    <div class="slot-popover-actions">
      <button type="button" class="button secondary" data-action="cancel">Cancel</button>
      <button type="button" class="button primary" data-action="confirm">Confirm &amp; send</button>
    </div>
  `;

  els.slotPopover.showPopover();

  const cellRect = cellEl.getBoundingClientRect();
  const popRect = els.slotPopover.getBoundingClientRect();
  const spaceAbove = cellRect.top;
  const placeBelow = spaceAbove < popRect.height + 16;
  const top = placeBelow ? cellRect.bottom + 10 : cellRect.top - popRect.height - 10;
  let left = cellRect.left + cellRect.width / 2 - popRect.width / 2;
  left = Math.min(Math.max(8, left), window.innerWidth - popRect.width - 8);

  els.slotPopover.style.top = `${top}px`;
  els.slotPopover.style.left = `${left}px`;
  els.slotPopover.dataset.placement = placeBelow ? "bottom" : "top";
  els.slotPopover.style.setProperty("--arrow-x", `${cellRect.left + cellRect.width / 2 - left}px`);

  els.slotPopover.querySelector('[data-action="cancel"]').addEventListener("click", hideSlotPopover);
  els.slotPopover.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
    const nextBody = currentBody() ?? clone(command.defaultBody) ?? {};
    if (focus.layerPath) setByPath(nextBody, focus.layerPath, row + (focus.layerOffset ?? 0));
    if (focus.channelStartPath) setByPath(nextBody, focus.channelStartPath, channel + (focus.channelOffset ?? 0));
    if (focus.channelEndPath) setByPath(nextBody, focus.channelEndPath, channel + (focus.channelOffset ?? 0));
    if (state.activeCommandId !== command.id) selectCommand(command.id);
    updateBody(nextBody);
    hideSlotPopover();
    await sendCommand(command, nextBody, { skipConfirm: true });
  });
}

function applyGridConfig() {
  els.gridRowsInput.value = state.gridRows;
  els.gridColsInput.value = state.gridCols;
  els.ledRowsInput.value = state.ledRows;
  els.ledColsInput.value = state.ledCols;
  renderMachine();
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
    if (!command) return;
    state.body = clone(command.defaultBody);
    els.bodyEditor.value = pretty(state.body);
    // Explicit reset: rebuild so a focused field also snaps back to default.
    buildControls();
    renderMachine();
  });
  els.bodyEditor.addEventListener("input", () => {
    try {
      state.body = parseEditorBody();
      syncControls();
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
  els.ioDrawerToggle.addEventListener("click", toggleDrawer);
  els.ioDrawerClose.addEventListener("click", closeDrawer);
  document.querySelectorAll(".tab").forEach((tab) => {
    if (tab.dataset.tab) tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.ioDrawer.classList.contains("is-open")) closeDrawer();
  });
  els.gridRowsInput.addEventListener("change", () => {
    state.gridRows = clampInt(els.gridRowsInput.value, 1, 20, state.gridRows);
    localStorage.setItem("manualTest.gridRows", state.gridRows);
    applyGridConfig();
  });
  els.gridColsInput.addEventListener("change", () => {
    state.gridCols = clampInt(els.gridColsInput.value, 1, 40, state.gridCols);
    localStorage.setItem("manualTest.gridCols", state.gridCols);
    applyGridConfig();
  });
  els.ledRowsInput.addEventListener("change", () => {
    state.ledRows = clampInt(els.ledRowsInput.value, 1, 20, state.ledRows);
    localStorage.setItem("manualTest.ledRows", state.ledRows);
    applyGridConfig();
  });
  els.ledColsInput.addEventListener("change", () => {
    state.ledCols = clampInt(els.ledColsInput.value, 1, 40, state.ledCols);
    localStorage.setItem("manualTest.ledCols", state.ledCols);
    applyGridConfig();
  });
  attachLedEvents();
  document.querySelectorAll(".door").forEach((door) =>
    door.addEventListener("click", () => {
      const command = getActiveCommand();
      const focus = command?.focus || {};
      if (!focus.doorPath) return;
      const nextBody = currentBody() ?? clone(command.defaultBody) ?? {};
      setByPath(nextBody, focus.doorPath, Number(door.dataset.door));
      updateBody(nextBody);
    })
  );
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

async function init() {
  attachEvents();
  setUnknownStatuses();
  renderHistory();
  applyGridConfig();
  observeSlotGridSize();

  const response = await fetch("/manual-test/commands.json");
  state.catalog = await response.json();
  state.activeCommandId = state.catalog.commands[0]?.id || null;
  renderCommandIcons();
  renderFlowSelect();
  selectCommand(state.activeCommandId);
  await refreshHealth();
  window.setInterval(refreshHealth, 15000);
}

init().catch((error) => {
  els.responseMeta.textContent = "UI init failed";
  els.responseOutput.textContent = pretty({ error: error.message });
  openDrawer("response");
});
