// ANES Browser Agent — giriş doğrulama.
import { BLOCKED_HOSTS, BLOCKED_URL_SCHEMES } from "./constants.js";

const ACTION_TYPES = new Set([
  "click", "dblclick", "hover", "rightclick",
  "type", "press", "select", "check", "uncheck",
  "scroll", "navigate", "new_tab", "back", "forward", "reload",
  "wait", "extract", "screenshot", "playbook"
]);

const PLAYBOOKS = new Set(["youtube_pick", "youtube_next", "youtube_previous", "ensure_playing", "dismiss_overlays"]);

const MAX_TEXT = 20000;
const MAX_URL = 4096;

export function clampString(value, max = MAX_TEXT) {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) : value;
}

export function isHttpUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL) return false;
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return false;
  return true;
}

export function isBlockedScheme(raw) {
  if (typeof raw !== "string") return true;
  const v = raw.trim().toLowerCase();
  return BLOCKED_URL_SCHEMES.some((s) => v.startsWith(s));
}

export function normalizeAction(input) {
  if (!input || typeof input !== "object") return null;
  const type = String(input.type || "");
  if (!ACTION_TYPES.has(type)) return null;
  const action = {
    type,
    frameId: Number.isInteger(input.frameId) ? input.frameId : 0,
    target: typeof input.target === "string" ? input.target.slice(0, 64) : "",
    snapshotId: typeof input.snapshotId === "string" ? input.snapshotId.slice(0, 64) : "",
    risk: input.risk === "high" || input.risk === "medium" ? input.risk : "low",
    description: clampString(input.description, 500),
    text: clampString(input.text, 10000),
    key: clampString(input.key, 64),
    optionText: clampString(input.optionText, 500),
    direction: input.direction === "up" ? "up" : "down",
    amount: Number.isFinite(input.amount) ? Math.max(0, Math.min(20000, input.amount)) : 600,
    url: clampString(input.url, MAX_URL),
    what: ["text", "value", "attribute", "table", "links", "comments"].includes(input.what)
      ? input.what : "text",
    attribute: clampString(input.attribute, 100),
    selector: clampString(input.selector, 500),
    urlIncludes: clampString(input.urlIncludes, 500),
    name: clampString(input.name, 64),
    query: clampString(input.query, 500),
    selection: clampString(input.selection, 32),
    count: Number.isFinite(input.count) ? Math.max(1, Math.min(10, Math.floor(input.count))) : 1,
    submit: input.submit === true || input.pressEnter === true,
    timeoutMs: Number.isFinite(input.timeoutMs)
      ? Math.max(100, Math.min(30000, input.timeoutMs)) : 5000,
    confirmed: input.confirmed === true,
    confirmationId: typeof input.confirmationId === "string"
      ? input.confirmationId.slice(0, 64) : ""
  };
  if ((type === "navigate" || type === "new_tab") && !isHttpUrl(action.url)) return null;
  if (type === "playbook" && !PLAYBOOKS.has(action.name)) return null;
  return action;
}

export function pageTitleOrEmpty(value) {
  return clampString(value, 300);
}
