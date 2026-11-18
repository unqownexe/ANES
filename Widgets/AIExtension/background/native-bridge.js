// ANES Browser Agent — yerel köprü (chrome.runtime.connectNative) yönetimi.
// ANES kapalıysa veya "Tarayıcı Kontrolü" kapalıysa native host hemen çıkar;
// bu modül bunu bağlantı hatası olarak raporlar. Uzaktan hiçbir ağ isteği yok.
import { HOST_NAME } from "../shared/constants.js";
import { envelope, isValidEnvelope, fitsLimit } from "../shared/protocol.js";

let port = null;
let connected = false;
let lastError = "";
let handlers = {
  onMessage: () => {},
  onConnect: () => {},
  onDisconnect: () => {}
};

export function setHandlers(next) {
  handlers = Object.assign({}, handlers, next || {});
}

export function isConnected() {
  return connected;
}

export function getLastError() {
  return lastError;
}

export function connectionState() {
  return { connected, host: HOST_NAME, error: lastError };
}

export function connect() {
  if (port) return true;
  lastError = "";
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (err) {
    port = null;
    lastError = String(err && err.message || err);
    return false;
  }
  if (!port) {
    lastError = "Native host could not be started";
    return false;
  }

  port.onMessage.addListener((msg) => {
    if (!isValidEnvelope(msg)) return;
    // hello_ack gelene kadar bağlı sayılmayız; ANES token doğrulaması yapar.
    if (msg.type === "hello_ack") connected = true;
    try { handlers.onMessage(msg); } catch (_) {}
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    lastError = err && err.message
      ? String(err.message)
      : "Native host disconnected";
    const was = connected;
    connected = false;
    port = null;
    try { handlers.onDisconnect(was, lastError); } catch (_) {}
  });

  // Port açılır açılmaz el sıkışmayı başlat: ANES hello_ack ile yanıtlar.
  // (Eskiden hello yalnız hello_ack gelince gönderiliyordu; karşılıklı bekleme
  // yüzünden bağlantı hiç kurulmuyordu.)
  try { handlers.onConnect(); } catch (_) {}

  return true;
}

export function disconnect() {
  const p = port;
  port = null;
  connected = false;
  if (p) {
    try { p.disconnect(); } catch (_) {}
  }
}

export function send(type, payload = {}, id = undefined) {
  if (!port) return false;
  const msg = envelope(type, payload, id);
  if (!fitsLimit(msg)) {
    lastError = "Message too large";
    return false;
  }
  try {
    port.postMessage(msg);
    return true;
  } catch (err) {
    lastError = String(err && err.message || err);
    return false;
  }
}

// ANES'in gönderdiği zarf kimliğini yanıta taşır (istek/yanıt eşleşmesi).
export function reply(type, request, payload = {}) {
  const id = request && typeof request.id === "string" ? request.id : undefined;
  return send(type, payload, id);
}
