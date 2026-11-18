// ANES Browser Agent — eylem doğrulama ve yürütme.
// Riskli eylemler ANES'teki onay penceresine gönderilir; onay gelmeden çalışmaz.
import {
  ACTION_TIMEOUT_MS,
  HIGH_RISK_WORDS,
  NAVIGATE_TIMEOUT_MS
} from "../shared/constants.js";
import { isHttpUrl, isBlockedScheme, normalizeAction } from "../shared/validation.js";
import { errorResult } from "../shared/protocol.js";

const NAV_TYPES = new Set(["navigate", "new_tab", "back", "forward", "reload"]);
const BASE_TYPES = new Set([
  "click", "type", "hover", "scroll", "navigate", "new_tab", "back", "forward", "reload",
  "wait", "extract", "playbook"
]);
const ADVANCED_TYPES = new Set([
  "dblclick", "rightclick", "press", "select", "check", "uncheck"
]);

function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), ms);
  });
}

function riskFromAction(action) {
  if (action.risk === "high") return "high";
  const text = `${action.description || ""} ${action.text || ""} ${action.optionText || ""}`
    .toLowerCase();
  if (action.type === "click" && HIGH_RISK_WORDS.some((w) => text.includes(w))) return "high";
  return action.risk === "medium" ? "medium" : "low";
}

function frameOf(action) {
  const m = /^f(\d+)-/.exec(action.target || "");
  if (!m) return { frameId: action.frameId, target: action.target };
  return { frameId: Number(m[1]), target: action.target.slice(m[0].length) };
}

function tabUrlAllowed(url) {
  if (!url) return false;
  if (isBlockedScheme(url)) return false;
  return isHttpUrl(url);
}

export async function runAction(tabId, tabUrl, rawAction, ctx) {
  const action = normalizeAction(rawAction);
  if (!action) {
    return errorResult(rawAction && rawAction.actionId, rawAction && rawAction.snapshotId,
      "not_supported", "Invalid action");
  }
  action.actionId = typeof rawAction.actionId === "string" ? rawAction.actionId : "";
  action.risk = riskFromAction(action);

  if (!tabUrlAllowed(tabUrl)) {
    return errorResult(action.actionId, action.snapshotId, "not_supported",
      "This page cannot be controlled");
  }
  if (ADVANCED_TYPES.has(action.type) && !ctx.advancedInput()) {
    return errorResult(action.actionId, action.snapshotId, "not_enabled",
      "Advanced input is disabled in ANES settings");
  }
  if (!BASE_TYPES.has(action.type) && !ADVANCED_TYPES.has(action.type)) {
    return errorResult(action.actionId, action.snapshotId, "not_supported",
      "Unknown action type");
  }
  if (action.type === "navigate" && !isHttpUrl(action.url)) {
    return errorResult(action.actionId, action.snapshotId, "not_supported",
      "Only http/https navigation is allowed");
  }

  // Yeni sekme içerik betiğine gönderilmez; burada açılır ve sekme kimliği
  // döndürülür. Service worker görev sekmesini bu kimliğe taşır.
  if (action.type === "new_tab") {
    try {
      const created = await chrome.tabs.create({ url: action.url, active: true });
      if (!created || !Number.isInteger(created.id)) throw new Error("create_failed");
      return {
        ok: true,
        actionId: action.actionId,
        snapshotId: action.snapshotId,
        changed: true,
        urlChanged: true,
        focusChanged: true,
        navigated: true,
        tabId: created.id,
        url: created.url || action.url,
        title: created.title || "",
        elapsedMs: 0,
        message: "New tab opened",
        data: null
      };
    } catch (err) {
      return errorResult(action.actionId, action.snapshotId, "not_supported",
        "New tab could not be opened");
    }
  }

  if (action.risk === "high" && !action.confirmed) {
    const answer = await ctx.requestConfirm({
      actionId: action.actionId,
      type: action.type,
      description: action.description || `${action.type} ${action.target || ""}`.trim(),
      risk: action.risk,
      url: action.url || "",
      text: action.text || ""
    });
    if (!answer || !answer.approved) {
      return errorResult(action.actionId, action.snapshotId, "user_rejected",
        "User rejected the action");
    }
    action.confirmed = true;
    action.confirmationId = answer.confirmationId || "";
  }

  const frame = frameOf(action);
  const message = {
    type: "anes:action",
    action: Object.assign({}, action, { target: frame.target, frameId: frame.frameId }),
    snapshotId: action.snapshotId
  };
  const timeout = NAV_TYPES.has(action.type) ? NAVIGATE_TIMEOUT_MS : ACTION_TIMEOUT_MS;

  try {
    const res = await Promise.race([
      chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }),
      timeoutPromise(timeout)
    ]);
    if (res && typeof res === "object") {
      return Object.assign({ actionId: action.actionId, snapshotId: action.snapshotId }, res);
    }
    return errorResult(action.actionId, action.snapshotId, "not_supported",
      "No response from page");
  } catch (err) {
    const text = String(err && err.message || err);
    // Gezinme sırasında içerik betiği boşaltılır; eylem yine de başlamıştır.
    // youtube_pick de sayfa değiştirebilir; aynı şekilde başarı sayılır.
    const navLike = NAV_TYPES.has(action.type) ||
      (action.type === "playbook" && action.name === "youtube_pick");
    if (navLike && /message port closed|receiving end|timeout|context invalidated/i.test(text)) {
      return {
        ok: true,
        actionId: action.actionId,
        snapshotId: action.snapshotId,
        changed: true,
        urlChanged: true,
        focusChanged: false,
        elapsedMs: 0,
        message: "Navigation started",
        navigated: true,
        data: null
      };
    }
    return errorResult(action.actionId, action.snapshotId,
      /timeout/i.test(text) ? "timeout" : "not_supported", text);
  }
}
