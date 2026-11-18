// ANES Browser Agent — service worker.
// Tek görev yürütür; planlama ANES'tedir. Uzaktan ağ isteği yoktur; yalnız
// chrome.runtime.connectNative ile yerel ANES köprüsüne bağlanır.
import {
  CONTENT_FILES,
  CONTENT_SCRIPT_ID,
  CONFIRM_TIMEOUT_MS,
  DEFAULT_ELEMENT_LIMIT,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  PING_TASK_MS,
  PROTOCOL_VERSION
} from "../shared/constants.js";
import { envelope, fitsLimit, messageBytes, uuid } from "../shared/protocol.js";
import {
  connect,
  disconnect,
  getLastError,
  isConnected,
  send,
  setHandlers
} from "./native-bridge.js";
import { collectSnapshot, waitForTabReady } from "./page-model.js";
import { runAction } from "./action-runner.js";
import * as tasks from "./task-state.js";

const RETRY_ALARM = "anes-retry";
const KEEPALIVE_ALARM = "anes-keepalive";

const state = {
  controlEnabled: false,
  session: "",
  config: {
    maxSteps: 12,
    advancedInput: false,
    snapshotTextLimit: 20000,
    snapshotElementLimit: DEFAULT_ELEMENT_LIMIT,
    snapshotMaxBytes: DEFAULT_MAX_SNAPSHOT_BYTES
  },
  pendingConfirms: new Map(),
  helloTimer: null,
  chain: Promise.resolve(),
  lastNativeError: "",
  lastTaskNote: ""
};

// ---------------------------------------------------------------- yardımcılar

function serialize(fn) {
  const run = state.chain.then(fn, fn);
  state.chain = run.catch(() => {});
  return run;
}

function nativeErrorText(text) {
  const s = String(text || "");
  if (/not found|not registered|Specified native messaging host/i.test(s)) {
    return "ANES köprüsü bulunamadı. ANES > Ayarlar > AI > Tarayıcı Kontrolü'nden Kur'a basın ve Chrome'u yeniden başlatın.";
  }
  if (/exited|closed|pipe|disconnected/i.test(s)) {
    return "ANES kapalı veya Tarayıcı Kontrolü kapalı.";
  }
  return s || "ANES kapalı.";
}

function notifyPopup() {
  try {
    chrome.runtime.sendMessage({ type: "anes:status_changed" }).catch(() => {});
  } catch (_) {}
}

async function buildStatus() {
  const task = tasks.getTask();
  let tab = null;
  try {
    const list = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = list && list[0] ? list[0] : null;
  } catch (_) {}
  return {
    connected: isConnected(),
    controlEnabled: state.controlEnabled,
    nativeError: state.lastNativeError || (isConnected() ? "" : nativeErrorText(getLastError())),
    session: state.session ? "ok" : "",
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    task: task ? {
      id: task.id,
      goal: task.goal,
      status: task.status,
      steps: task.steps,
      maxSteps: task.maxSteps
    } : null,
    tab: tab ? { id: tab.id, title: tab.title || "", url: tab.url || "" } : null,
    note: state.lastTaskNote
  };
}

function activeTaskPayload(extra = {}) {
  const task = tasks.getTask();
  return Object.assign({
    taskId: task ? task.id : "",
    goal: task ? task.goal : "",
    steps: task ? task.steps : 0,
    maxSteps: task ? task.maxSteps : state.config.maxSteps
  }, extra);
}

function pushEvent(kind, label, detail = "", ok = true) {
  send("task_event", activeTaskPayload({ kind, label, detail, ok }));
}

async function ensureContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch (_) {}
  try {
    await chrome.scripting.registerContentScripts([{
      id: CONTENT_SCRIPT_ID,
      matches: ["http://*/*", "https://*/*"],
      js: CONTENT_FILES,
      runAt: "document_idle",
      allFrames: true,
      persistAcrossSessions: false
    }]);
  } catch (err) {
    state.lastNativeError = "Content script registration failed: " + String(err && err.message || err);
  }
}

async function removeContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch (_) {}
}

async function injectIntoOpenTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: CONTENT_FILES
    });
    return true;
  } catch (_) {
    return false;
  }
}

function isControllableUrl(url) {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com)\//i.test(url)) return false;
  return true;
}

// ------------------------------------------------------------ onay istekleri

function requestConfirm(info) {
  const requestId = uuid();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pendingConfirms.delete(requestId);
      resolve({ approved: false, reason: "timeout", confirmationId: "" });
    }, CONFIRM_TIMEOUT_MS);
    state.pendingConfirms.set(requestId, { resolve, timer });
    const ok = send("confirm_request", Object.assign({ requestId, taskId: tasks.getTask()?.id || "" }, info));
    if (!ok) {
      clearTimeout(timer);
      state.pendingConfirms.delete(requestId);
      resolve({ approved: false, reason: "send_failed", confirmationId: "" });
    }
  });
}

function resolveConfirm(payload) {
  const id = payload && payload.requestId;
  const pending = state.pendingConfirms.get(id);
  if (!pending) return;
  state.pendingConfirms.delete(id);
  clearTimeout(pending.timer);
  pending.resolve({
    approved: payload.approved === true,
    reason: typeof payload.reason === "string" ? payload.reason : "",
    confirmationId: typeof payload.confirmationId === "string" ? payload.confirmationId : ""
  });
}

function rejectAllConfirms() {
  for (const [, p] of state.pendingConfirms) {
    clearTimeout(p.timer);
    p.resolve({ approved: false, reason: "disconnected", confirmationId: "" });
  }
  state.pendingConfirms.clear();
}

// --------------------------------------------------------------- görev akışı

async function sendTabState() {
  if (!isConnected()) return;
  try {
    const list = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = list && list[0];
    if (!tab) return;
    send("tab_state", {
      tabId: tab.id,
      url: tab.url || "",
      title: tab.title || "",
      status: tab.status || "",
      controllable: isControllableUrl(tab.url || "")
    });
  } catch (_) {}
}

async function startTask(msg) {
  const payload = msg.payload || {};
  if (!isConnected() || !state.controlEnabled) {
    send("task_started", { taskId: payload.taskId || "", ok: false, error: "not_connected" }, msg.id);
    return;
  }
  if (tasks.isActive()) {
    send("task_started", { taskId: payload.taskId || "", ok: false, error: "task_running" }, msg.id);
    return;
  }

  let tab = null;
  const requested = Number.isInteger(payload.tabId) ? payload.tabId : -1;
  if (requested >= 0) {
    try { tab = await chrome.tabs.get(requested); } catch (_) { tab = null; }
  }
  if (!tab) {
    const list = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = list && list[0] ? list[0] : null;
  }
  if (!tab || !isControllableUrl(tab.url || "")) {
    send("task_started", {
      taskId: payload.taskId || "", ok: false,
      error: "no_controllable_tab"
    }, msg.id);
    return;
  }

  const goal = typeof payload.goal === "string" ? payload.goal : "";
  if (!goal.trim()) {
    send("task_started", { taskId: payload.taskId || "", ok: false, error: "empty_goal" }, msg.id);
    return;
  }

  await ensureContentScripts();
  await injectIntoOpenTab(tab.id);
  const task = await tasks.createTask(goal, tab.id, { maxSteps: state.config.maxSteps });
  state.lastTaskNote = "";
  send("task_started", {
    taskId: task.id,
    ok: true,
    tabId: tab.id,
    url: tab.url || "",
    title: tab.title || ""
  }, msg.id);
  notifyPopup();
}

async function stopTask(msg, reason = "requested") {
  const payload = msg && msg.payload ? msg.payload : {};
  const task = tasks.getTask();
  if (task) {
    // ANES kendi bitiş/hata/durdurma satırını zaten ekliyor; burada ayrıca
    // "durduruldu" olayı gönderilmez (çift kayıt olurdu).
    await tasks.updateTask({ status: reason === "error" ? "error" : "stopped" });
  }
  try {
    if (task && task.tabId >= 0) {
      await chrome.tabs.sendMessage(task.tabId, { type: "anes:cancel" }, { frameId: 0 });
    }
  } catch (_) {}
  await tasks.clearTask();
  state.lastNativeError = "";
  send("task_stopped", {
    taskId: payload.taskId || (task ? task.id : ""),
    reason: String(reason || "requested")
  }, msg && msg.id);
  notifyPopup();
}

async function handleSnapshotRequest(msg) {
  const payload = msg.payload || {};
  const task = tasks.getTask();
  if (!task || task.status === "stopped" || task.status === "done") {
    send("snapshot", { taskId: payload.taskId || "", ok: false, error: "no_task" }, msg.id);
    return;
  }
  let tab = null;
  try { tab = await chrome.tabs.get(task.tabId); } catch (_) { tab = null; }
  if (!tab) {
    await tasks.updateTask({ status: "error", lastError: "tab_closed" });
    send("snapshot", { taskId: task.id, ok: false, error: "tab_closed" }, msg.id);
    return;
  }
  if (!isControllableUrl(tab.url || "")) {
    send("snapshot", { taskId: task.id, ok: false, error: "blocked_page", url: tab.url || "" }, msg.id);
    return;
  }

  const snapshotId = typeof payload.snapshotId === "string" && payload.snapshotId
    ? payload.snapshotId : uuid();
  const options = {
    snapshotId,
    elementLimit: Number(payload.elementLimit) || state.config.snapshotElementLimit,
    textLimit: Number(payload.textLimit) || state.config.snapshotTextLimit,
    maxBytes: Number(payload.maxBytes) || state.config.snapshotMaxBytes
  };

  // Yükleme sürüyorsa kısa süre bekle; içerik betiğini yeniden enjekte etmeyi dene.
  if (tab.status === "loading") tab = await waitForTabReady(tab.id, 15000) || tab;
  let snapshot = await collectSnapshot(tab, options);
  if (!snapshot.interactive.length && !snapshot.text) {
    const injected = await injectIntoOpenTab(tab.id);
    if (injected) snapshot = await collectSnapshot(tab, options);
  }
  snapshot.snapshotId = snapshotId;

  let out = { taskId: task.id, ok: true, snapshot };
  if (!fitsLimit(envelope("snapshot", out))) {
    out = {
      taskId: task.id,
      ok: true,
      snapshot: Object.assign({}, snapshot, {
        text: (snapshot.text || "").slice(0, 8000),
        interactive: snapshot.interactive.slice(0, 150),
        flags: Object.assign({}, snapshot.flags, { truncated: true })
      })
    };
    if (!fitsLimit(envelope("snapshot", out))) {
      out.snapshot.text = "";
      out.snapshot.interactive = out.snapshot.interactive.slice(0, 60);
    }
  }
  await tasks.updateTask({ lastSnapshotId: snapshotId, status: "running" });
  send("snapshot", out, msg.id);
  notifyPopup();
}

async function handleAction(msg) {
  const payload = msg.payload || {};
  const task = tasks.getTask();
  if (!task || !tasks.isActive()) {
    send("action_result", {
      taskId: payload.taskId || "", ok: false,
      actionId: payload.action ? payload.action.actionId : "",
      error: { code: "no_task", message: "No active task" }
    }, msg.id);
    return;
  }
  if (tasks.exceededSteps()) {
    await tasks.updateTask({ status: "stopped", lastError: "max_steps" });
    send("action_result", {
      taskId: task.id,
      ok: false,
      actionId: payload.action ? payload.action.actionId : "",
      error: { code: "max_steps", message: "Maximum step count reached" }
    }, msg.id);
    pushEvent("stop", "Adım sınırına ulaşıldı", "", false);
    return;
  }

  let tab = null;
  try { tab = await chrome.tabs.get(task.tabId); } catch (_) { tab = null; }
  if (!tab) {
    send("action_result", {
      taskId: task.id, ok: false,
      actionId: payload.action ? payload.action.actionId : "",
      error: { code: "tab_closed", message: "Tab was closed" }
    }, msg.id);
    return;
  }

  const action = Object.assign({}, payload.action || {});
  if (!action.snapshotId && task.lastSnapshotId) action.snapshotId = task.lastSnapshotId;
  await tasks.bumpStep();

  const res = await runAction(tab.id, tab.url || "", action, {
    advancedInput: () => state.config.advancedInput === true,
    requestConfirm
  });

  // Yeni sekme açıldıysa görev artık o sekmede sürer.
  if (res.ok && Number.isInteger(res.tabId) && res.tabId !== tab.id) {
    await tasks.updateTask({ tabId: res.tabId, lastSnapshotId: "" });
    await injectIntoOpenTab(res.tabId);
    try { tab = await chrome.tabs.get(res.tabId); } catch (_) { tab = null; }
  }

  // Gezinme sonrası sayfanın oturmasını bekle (yanıt yine hemen döner).
  if (res.ok && (res.navigated || res.urlChanged) && tab) {
    const ready = await waitForTabReady(tab.id, 15000);
    if (ready) {
      res.url = ready.url || res.url || "";
      res.title = ready.title || res.title || "";
      res.tabStatus = ready.status || "";
    }
  }

  let out = { taskId: task.id, ...res };
  if (!fitsLimit(envelope("action_result", out))) {
    out = Object.assign({}, out, { data: null, message: String(out.message || "").slice(0, 2000) });
  }
  send("action_result", out, msg.id);
  notifyPopup();
}

async function handleConfigUpdate(msg) {
  const p = msg.payload || {};
  state.config = Object.assign({}, state.config, {
    maxSteps: Math.max(1, Math.min(100, Number(p.maxSteps) || state.config.maxSteps)),
    advancedInput: p.advancedInput === true,
    snapshotTextLimit: Math.max(1000, Math.min(40000,
      Number(p.snapshotTextLimit) || state.config.snapshotTextLimit)),
    snapshotElementLimit: Math.max(50, Math.min(1500,
      Number(p.snapshotElementLimit) || state.config.snapshotElementLimit)),
    snapshotMaxBytes: Math.max(50000, Math.min(900000,
      Number(p.snapshotMaxBytes) || state.config.snapshotMaxBytes))
  });
  state.controlEnabled = p.enabled !== false;
  if (!state.controlEnabled) {
    await stopTask(null, "control_disabled");
    await removeContentScripts();
  }
  try {
    await chrome.storage.local.set({ anesConfig: state.config });
  } catch (_) {}
  send("config_ack", { ok: true }, msg.id);
  notifyPopup();
}

// K-408: Chrome'da ses çalan sekmeleri listele (AI video indirme hızlı yolu).
async function handleAudibleTabs(msg) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ audible: true });
  } catch (err) {
    send("audible_tabs", {
      ok: false,
      error: String(err && err.message || err || "audible_query_failed")
    }, msg.id);
    return;
  }
  const list = (tabs || [])
    .filter((t) => t && typeof t.url === "string" && /^https?:/i.test(t.url))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0);
    })
    .slice(0, 12)
    .map((t) => ({
      id: t.id,
      url: t.url,
      title: String(t.title || ""),
      active: t.active === true
    }));
  send("audible_tabs", { ok: true, tabs: list }, msg.id);
}

// ------------------------------------------------------------- native olaylar

async function handleNative(msg) {
  switch (msg.type) {
    case "hello_ack": {
      if (state.helloTimer) clearTimeout(state.helloTimer);
      state.helloTimer = null;
      const p = msg.payload || {};
      state.session = typeof p.session === "string" ? p.session : "";
      state.controlEnabled = p.enabled !== false;
      if (p.settings && typeof p.settings === "object") {
        await handleConfigUpdate({ payload: p.settings, id: msg.id });
      }
      if (state.controlEnabled) await ensureContentScripts();
      else await removeContentScripts();
      send("status", {
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        connected: true,
        controlEnabled: state.controlEnabled
      });
      sendTabState();
      notifyPopup();
      return;
    }
    case "start_task":
      await serialize(() => startTask(msg));
      return;
    case "stop_task": {
      const reason = msg && msg.payload && typeof msg.payload.reason === "string"
        ? msg.payload.reason : "requested";
      await serialize(() => stopTask(msg, reason));
      return;
    }
    case "snapshot_request":
      await serialize(() => handleSnapshotRequest(msg));
      return;
    case "audible_tabs_request":
      await handleAudibleTabs(msg);
      return;
    case "action":
      await serialize(() => handleAction(msg));
      return;
    case "confirm_response":
      resolveConfirm(msg.payload || {});
      return;
    case "config_update":
      await handleConfigUpdate(msg);
      return;
    case "ping":
      send("pong", { t: Date.now() }, msg.id);
      return;
    case "pong":
      return;
    case "ext_updated":
      // ANES eklenti dosyalarını GitHub'dan güncelledi; yeni sürümü yükle.
      try { chrome.runtime.reload(); } catch (_) {}
      return;
    default:
      send("error", { code: "unknown_type", message: msg.type }, msg.id);
      return;
  }
}

setHandlers({
  onConnect() {
    if (state.helloTimer) clearTimeout(state.helloTimer);
    state.helloTimer = setTimeout(() => {
      state.helloTimer = null;
      if (isConnected()) return;
      // hello_ack gelmedi: ANES tarafı hazır değil, bağlantıyı yenile.
      disconnect();
    }, 8000);
    send("hello", {
      protocol: PROTOCOL_VERSION,
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      browser: navigator.userAgent
    });
  },
  onMessage(msg) {
    handleNative(msg).catch((err) => {
      pushEvent("error", "Köprü hatası", String(err && err.message || err), false);
    });
  },
  async onDisconnect(wasConnected, error) {
    if (state.helloTimer) clearTimeout(state.helloTimer);
    state.helloTimer = null;
    state.session = "";
    state.controlEnabled = false;
    state.lastNativeError = nativeErrorText(error);
    rejectAllConfirms();
    await removeContentScripts();
    await tasks.clearTask();
    notifyPopup();
  }
});

// ------------------------------------------------------------------ yaşam döngüsü

function requestConnect() {
  if (isConnected() || !chrome.runtime.connectNative) return;
  connect();
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const got = await chrome.storage.local.get("anesConfig");
    if (got && got.anesConfig) {
      state.config = Object.assign({}, state.config, got.anesConfig);
    }
  } catch (_) {}
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
  requestConnect();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
  requestConnect();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) {
    if (!isConnected()) requestConnect();
  } else if (alarm.name === KEEPALIVE_ALARM) {
    if (!isConnected()) {
      requestConnect();
    } else if (tasks.isActive()) {
      send("ping", { t: Date.now() });
    }
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  if (msg.type === "anes:popup_status") {
    buildStatus().then(sendResponse).catch(() => sendResponse({ connected: false }));
    return true;
  }
  if (msg.type === "anes:popup_reconnect") {
    disconnect();
    state.lastNativeError = "";
    setTimeout(requestConnect, 250);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "anes:popup_options") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

let tabStateTimer = null;
function scheduleTabState() {
  if (tabStateTimer) return;
  tabStateTimer = setTimeout(() => {
    tabStateTimer = null;
    sendTabState();
  }, 500);
}
chrome.tabs.onActivated.addListener(scheduleTabState);
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info && (info.status === "complete" || info.title || info.url)) scheduleTabState();
});
chrome.windows.onFocusChanged.addListener(scheduleTabState);

// Service worker her uyandığında bağlantıyı tazele.
tasks.loadTask().catch(() => {});
requestConnect();
