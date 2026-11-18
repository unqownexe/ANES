// ANES Browser Agent — görev durumu (tek görev, storage.session).
import { uuid } from "../shared/protocol.js";

const KEY = "anes.task";

let task = null;

function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    goal: typeof raw.goal === "string" ? raw.goal.slice(0, 4000) : "",
    status: ["running", "paused", "waiting", "done", "error", "stopped"]
      .includes(raw.status) ? raw.status : "running",
    startedAt: Number(raw.startedAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    tabId: Number.isInteger(raw.tabId) ? raw.tabId : -1,
    steps: Number(raw.steps) || 0,
    maxSteps: Number(raw.maxSteps) || 12,
    lastSnapshotId: typeof raw.lastSnapshotId === "string" ? raw.lastSnapshotId : "",
    lastError: typeof raw.lastError === "string" ? raw.lastError : ""
  };
}

export async function loadTask() {
  try {
    const got = await chrome.storage.session.get(KEY);
    task = sanitize(got && got[KEY]);
  } catch (_) {
    task = null;
  }
  return task;
}

export async function saveTask() {
  try {
    if (task) await chrome.storage.session.set({ [KEY]: task });
    else await chrome.storage.session.remove(KEY);
  } catch (_) {}
}

export function getTask() {
  return task;
}

export function isActive() {
  return Boolean(task && (task.status === "running" || task.status === "waiting" ||
    task.status === "paused"));
}

export async function createTask(goal, tabId, options = {}) {
  task = {
    id: uuid(),
    goal: String(goal || "").slice(0, 4000),
    status: "running",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    tabId,
    steps: 0,
    maxSteps: Math.max(1, Math.min(100, Number(options.maxSteps) || 12)),
    lastSnapshotId: "",
    lastError: ""
  };
  await saveTask();
  return task;
}

export async function updateTask(patch) {
  if (!task) return null;
  task = Object.assign({}, task, patch || {}, { updatedAt: Date.now() });
  await saveTask();
  return task;
}

export async function bumpStep() {
  if (!task) return null;
  task.steps += 1;
  task.updatedAt = Date.now();
  await saveTask();
  return task;
}

export async function clearTask() {
  task = null;
  await saveTask();
}

export function exceededSteps() {
  return Boolean(task && task.steps >= task.maxSteps);
}
