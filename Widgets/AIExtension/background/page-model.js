// ANES Browser Agent — sekme sayfa modeli.
// Content script'ten gelen çerçeve anlık görüntülerini birleştirir, kimlikleri
// çerçeve önekiyle (f<frameId>-el-<n>) benzersiz yapar ve boyut sınırlarını uygular.
import {
  DEFAULT_ELEMENT_LIMIT,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  SNAPSHOT_TIMEOUT_MS
} from "../shared/constants.js";
import { messageBytes } from "../shared/protocol.js";

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    promise.then((value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

function frameTags(frame) {
  return {
    frameId: frame.frameId,
    url: frame.url,
    error: frame.error || ""
  };
}

function validSnapshot(frame) {
  return frame && frame.snapshot && typeof frame.snapshot === "object";
}

function prefixItems(items, frameId, budget) {
  const out = [];
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (out.length >= budget) break;
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) continue;
    out.push(Object.assign({}, raw, {
      id: `f${frameId}-${id}`,
      frameId,
      context: typeof raw.context === "string" ? raw.context : ""
    }));
  }
  return out;
}

function mergeForms(forms, frameId, budget) {
  const out = [];
  if (!Array.isArray(forms)) return out;
  for (const form of forms) {
    if (out.length >= budget) break;
    if (!form || typeof form !== "object") continue;
    const fields = [];
    for (const f of Array.isArray(form.fields) ? form.fields : []) {
      if (fields.length >= 20) break;
      if (!f || typeof f.id !== "string") continue;
      fields.push(Object.assign({}, f, { id: `f${frameId}-${f.id}` }));
    }
    out.push(Object.assign({}, form, { fields }));
  }
  return out;
}

function mergeFlags(frames) {
  const flags = {
    captcha: false,
    loginWall: false,
    cookieBanner: false,
    truncated: false
  };
  for (const f of frames) {
    if (!validSnapshot(f) || !f.snapshot.flags) continue;
    const sf = f.snapshot.flags;
    flags.captcha = flags.captcha || Boolean(sf.captcha);
    flags.loginWall = flags.loginWall || Boolean(sf.loginWall);
    flags.cookieBanner = flags.cookieBanner || Boolean(sf.cookieBanner);
    flags.truncated = flags.truncated || Boolean(sf.truncated);
  }
  return flags;
}

function trimToBytes(snapshot, maxBytes) {
  // Önce etkileşimli öğeler kırpılır, sonra metin. Ana çerçeve öğeleri korunur.
  let bytes = messageBytes(snapshot);
  if (bytes <= maxBytes) return snapshot;
  const items = snapshot.interactive;
  while (items.length > 40 && bytes > maxBytes) {
    const cut = Math.max(1, Math.floor(items.length * 0.15));
    items.splice(items.length - cut, cut);
    snapshot.flags.truncated = true;
    bytes = messageBytes(snapshot);
  }
  if (bytes > maxBytes && typeof snapshot.text === "string") {
    let keep = Math.floor(snapshot.text.length * 0.7);
    while (keep > 2000 && bytes > maxBytes) {
      snapshot.text = snapshot.text.slice(0, keep) + "\n…";
      snapshot.flags.truncated = true;
      bytes = messageBytes(snapshot);
      keep = Math.floor(keep * 0.75);
    }
  }
  return snapshot;
}

// frames: [{ frameId, url, title, snapshot } | { frameId, url, error }]
export function mergeSnapshots(tab, frames, options = {}) {
  const maxElements = Math.max(50, Math.min(1500,
    Number(options.elementLimit) || DEFAULT_ELEMENT_LIMIT));
  const textLimit = Math.max(1000, Math.min(40000,
    Number(options.textLimit) || 20000));
  const maxBytes = Math.max(50000, Math.min(900000,
    Number(options.maxBytes) || DEFAULT_MAX_SNAPSHOT_BYTES));

  const main = frames.find((f) => f.frameId === 0 && validSnapshot(f));
  const mainSnap = main ? main.snapshot : {};
  const interactive = [];
  const forms = [];
  const dialogs = [];
  const alerts = [];
  let text = "";

  if (main) {
    interactive.push(...prefixItems(mainSnap.interactive, 0,
      Math.max(40, Math.floor(maxElements * 0.8))));
    forms.push(...mergeForms(mainSnap.forms, 0, 20));
    dialogs.push(...(Array.isArray(mainSnap.dialogs) ? mainSnap.dialogs.slice(0, 10) : []));
    alerts.push(...(Array.isArray(mainSnap.alerts) ? mainSnap.alerts.slice(0, 10) : []));
    text = typeof mainSnap.text === "string" ? mainSnap.text : "";
  }

  const subs = frames.filter((f) => f.frameId !== 0 && validSnapshot(f));
  const perSub = subs.length ? Math.max(20, Math.floor(maxElements * 0.2 / subs.length)) : 0;
  for (const f of subs) {
    const s = f.snapshot;
    interactive.push(...prefixItems(s.interactive, f.frameId, perSub));
    forms.push(...mergeForms(s.forms, f.frameId, 6));
    if (Array.isArray(s.dialogs)) {
      for (const d of s.dialogs.slice(0, 3)) dialogs.push(`[frame ${f.frameId}] ${d}`);
    }
    if (Array.isArray(s.alerts)) {
      for (const a of s.alerts.slice(0, 3)) alerts.push(`[frame ${f.frameId}] ${a}`);
    }
    if (text.length < textLimit && typeof s.text === "string" && s.text.trim()) {
      const room = Math.max(0, textLimit - text.length - 32);
      if (room > 200) text += `\n\n[frame ${f.frameId}]\n` + s.text.slice(0, room);
    }
  }

  const snapshot = {
    snapshotId: main ? mainSnap.snapshotId || "" : "",
    tabId: tab && Number.isInteger(tab.id) ? tab.id : -1,
    url: String(tab && tab.url || (main && mainSnap.url) || ""),
    title: String(tab && tab.title || (mainSnap.title) || ""),
    readyState: String(mainSnap.readyState || "complete"),
    viewport: mainSnap.viewport || { w: 0, h: 0, scrollX: 0, scrollY: 0, dpr: 1 },
    focused: String(mainSnap.focused || ""),
    text: text.slice(0, textLimit),
    headings: Array.isArray(mainSnap.headings) ? mainSnap.headings.slice(0, 60) : [],
    // K-403/K-405: yorumlar ve medya durumu birleşik snapshot'ta korunur.
    comments: Array.isArray(mainSnap.comments) ? mainSnap.comments.slice(0, 20) : [],
    commentsSelector: typeof mainSnap.commentsSelector === "string" ? mainSnap.commentsSelector : "",
    media: mainSnap.media && typeof mainSnap.media === "object" ? mainSnap.media : {
      count: 0, paused: true, adShowing: false, title: "", url: ""
    },
    interactive: interactive.slice(0, maxElements),
    forms: forms.slice(0, 30),
    dialogs: dialogs.slice(0, 10),
    alerts: alerts.slice(0, 10),
    frames: frames.map(frameTags),
    flags: mergeFlags(frames),
    untrusted: true
  };
  if (interactive.length > maxElements) snapshot.flags.truncated = true;
  return trimToBytes(snapshot, maxBytes);
}

async function frameIdsForTab(tabId) {
  if (!chrome.webNavigation || !chrome.webNavigation.getAllFrames) return [0];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!Array.isArray(frames) || !frames.length) return [0];
    return frames.map((f) => f.frameId);
  } catch (_) {
    return [0];
  }
}

async function snapshotFrame(tabId, frameId, request) {
  try {
    const res = await withTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "anes:snapshot",
        snapshotId: request.snapshotId,
        elementLimit: request.elementLimit,
        textLimit: request.textLimit
      }, { frameId }),
      SNAPSHOT_TIMEOUT_MS,
      null
    );
    if (res && res.ok && res.snapshot) {
      return { frameId, url: res.snapshot.url || "", snapshot: res.snapshot };
    }
    return { frameId, url: "", error: res && res.error ? String(res.error) : "no_snapshot" };
  } catch (err) {
    return { frameId, url: "", error: String(err && err.message || err) };
  }
}

export async function collectSnapshot(tab, request) {
  const ids = await frameIdsForTab(tab.id);
  const frames = await Promise.all(ids.map((id) => snapshotFrame(tab.id, id, request)));
  return mergeSnapshots(tab, frames, request);
}

// Sekme yüklenmesini (en fazla ms) bekler; hazır değilse son durumu döndürür.
export async function waitForTabReady(tabId, ms = 15000) {
  const started = Date.now();
  let tab = null;
  while (Date.now() - started < ms) {
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {
      return null;
    }
    if (tab.status === "complete") return tab;
    await new Promise((r) => setTimeout(r, 250));
  }
  return tab;
}
