// ANES Browser Agent — content script giriş noktası.
(function () {
  "use strict";
  if (window.__anesPageAgent) return;
  window.__anesPageAgent = { version: "1.0.0", installedAt: Date.now() };
  let cancelled = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;
    if (msg.type === "anes:ping") {
      sendResponse({ ok: true, agent: true, url: location.href, title: document.title });
      return false;
    }
    if (msg.type === "anes:cancel") {
      cancelled = true;
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === "anes:snapshot") {
      cancelled = false;
      try {
        const snap = window.__anesSnapshot.build(msg);
        sendResponse({ ok: Boolean(snap), snapshot: snap });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      }
      return false;
    }
    if (msg.type === "anes:action") {
      if (cancelled) {
        sendResponse({ ok: false, error: { code: "stale_target", message: "Task cancelled" } });
        return false;
      }
      const action = msg.action || {};
      const snapshotId = msg.snapshotId || "";
      window.__anesActions.run(action, snapshotId).then((res) => {
        try { sendResponse(res); } catch (_) {}
      }).catch((err) => {
        sendResponse({
          ok: false,
          actionId: action.actionId || "",
          snapshotId,
          error: { code: "not_supported", message: String(err && err.message || err) }
        });
      });
      return true;
    }
    return false;
  });
})();
