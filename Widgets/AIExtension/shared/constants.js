// ANES Browser Agent — sabitler.
export const PROTOCOL_VERSION = 1;
export const HOST_NAME = "com.webtelya.anes.ai";
export const CONTENT_SCRIPT_ID = "anes-page-agent";
export const CONTENT_FILES = [
  "content/dom-utils.js",
  "content/snapshot.js",
  "content/actions.js",
  "content/content.js"
];
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_SNAPSHOT_BYTES = 200000;
export const DEFAULT_ELEMENT_LIMIT = 500;
export const SNAPSHOT_TIMEOUT_MS = 5000;
export const ACTION_TIMEOUT_MS = 30000;
export const NAVIGATE_TIMEOUT_MS = 30000;
export const CONFIRM_TIMEOUT_MS = 120000;
export const PING_IDLE_MS = 60000;
export const PING_TASK_MS = 10000;
export const BLOCKED_URL_SCHEMES = [
  "chrome:", "edge:", "about:", "chrome-extension:", "devtools:", "view-source:"
];
export const BLOCKED_HOSTS = [
  "chromewebstore.google.com",
  "chrome.google.com"
];
export const HIGH_RISK_WORDS = [
  "pay", "purchase", "buy", "delete", "remove", "send", "submit", "post",
  "login", "log in", "sign in", "signin", "logout", "log out", "unsubscribe",
  "change password", "accept", "confirm order", "checkout"
];
