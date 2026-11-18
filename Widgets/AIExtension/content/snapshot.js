// ANES Browser Agent — sayfa anlık görüntüsü.
(function () {
  "use strict";
  if (window.__anesSnapshot) return;

  function build(msg) {
    const d = window.__anesDom;
    if (!d) return null;
    const limit = Math.max(50, Math.min(1500, Number(msg.elementLimit) || 500));
    const textLimit = Math.max(1000, Math.min(40000, Number(msg.textLimit) || 20000));
    const sid = String(msg.snapshotId || "");
    d.reset(sid);

    const inter = d.collectInteractive(limit);
    const f = d.flags();
    const text = d.collectText(textLimit);
    const truncated = inter.truncated || text.length >= textLimit;
    f.truncated = truncated;

    return {
      snapshotId: sid,
      frameId: 0,
      url: String(location.href || ""),
      title: String(document.title || ""),
      readyState: String(document.readyState || "loading"),
      viewport: {
        w: Math.round(window.innerWidth || 0),
        h: Math.round(window.innerHeight || 0),
        scrollX: Math.round(window.scrollX || 0),
        scrollY: Math.round(window.scrollY || 0),
        dpr: Number(window.devicePixelRatio || 1)
      },
      focused: d.focusedId(),
      text,
      comments: d.collectComments(),
      commentsSelector: d.lastCommentsSelector ? d.lastCommentsSelector() : "",
      media: d.collectMedia(),
      headings: d.collectHeadings(),
      interactive: inter.items,
      forms: d.collectForms(),
      dialogs: d.collectDialogs(),
      alerts: d.collectAlerts(),
      frames: [],
      flags: f,
      untrusted: true
    };
  }

  window.__anesSnapshot = { build };
})();
