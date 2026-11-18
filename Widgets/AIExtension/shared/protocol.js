// ANES Browser Agent — protokol zarfları ve yardımcıları.
import { PROTOCOL_VERSION, MAX_MESSAGE_BYTES } from "./constants.js";

export function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function envelope(type, payload = {}, id = uuid()) {
  return { v: PROTOCOL_VERSION, type, id, ts: Date.now(), payload };
}

export function isValidEnvelope(msg) {
  return Boolean(msg) && typeof msg === "object" &&
    msg.v === PROTOCOL_VERSION && typeof msg.type === "string" && msg.type.length > 0;
}

export function messageBytes(msg) {
  try {
    return new TextEncoder().encode(JSON.stringify(msg)).length;
  } catch (_) {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function fitsLimit(msg) {
  return messageBytes(msg) <= MAX_MESSAGE_BYTES;
}

export function errorResult(actionId, snapshotId, code, message) {
  return {
    ok: false,
    actionId,
    snapshotId,
    error: { code, message: String(message || code) }
  };
}
