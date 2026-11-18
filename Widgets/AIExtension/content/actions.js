// ANES Browser Agent — eylem yürütücü.
// K-405: type/click için kurtarma merdiveni, katman kapatma, akıllı bekleme ve
// deterministik site playbook'ları (YouTube seçim/oynatma, overlay kapatma).
(function () {
  "use strict";
  if (window.__anesActions) return;

  const ALLOWED = new Set([
    "click", "dblclick", "hover", "rightclick",
    "type", "press", "select", "check", "uncheck",
    "scroll", "navigate", "back", "forward", "reload",
    "wait", "extract", "screenshot", "playbook"
  ]);

  const URL_SAFE = new Set(["navigate", "back", "forward", "reload", "wait", "extract", "playbook"]);

  const DISMISS_RE = /^(accept all|accept|i agree|agree|allow all|allow|got it|ok|okay|tamam|kabul et|tumunu kabul et|tümünü kabul et|kabul ediyorum|anladim|anladım|close|dismiss|kapat|no thanks|not now|simdi degil|şimdi değil|daha sonra|later|reject all|reddet|devam et|continue)$/i;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fold(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resultOk(action, snapshotId, started, changed, extra = {}) {
    return Object.assign({
      ok: true,
      actionId: String(action.actionId || ""),
      snapshotId,
      changed: Boolean(changed),
      urlChanged: false,
      focusChanged: false,
      navigated: false,
      elapsedMs: Math.max(0, Date.now() - started),
      message: "Done",
      data: null
    }, extra);
  }

  function resultErr(action, snapshotId, code, message) {
    return {
      ok: false,
      actionId: String(action.actionId || ""),
      snapshotId,
      error: { code, message: String(message || code) }
    };
  }

  function isHttp(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function mouse(el, type, opts) {
    const init = Object.assign({
      bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
      clientX: 0, clientY: 0
    }, opts || {});
    el.dispatchEvent(new MouseEvent(type, init));
  }

  function scrollIntoView(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    } catch (_) {
      try { el.scrollIntoView(false); } catch (__) {}
    }
  }

  function signature() {
    try {
      const a = document.activeElement;
      return {
        url: location.href,
        focus: a && a !== document.body ? (a.tagName + "#" + (a.id || "")) : "",
        textLen: document.body ? (document.body.innerText || "").length : 0
      };
    } catch (_) {
      return { url: location.href, focus: "", textLen: 0 };
    }
  }

  // Sabit sleep yerine DOM sakinleşmesini bekle (üst sınırlı).
  function waitForQuiet(maxMs = 600, quietMs = 140) {
    return new Promise((resolve) => {
      let done = false;
      let maxTimer = null;
      let quietTimer = null;
      let obs = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (obs) { try { obs.disconnect(); } catch (_) {} }
        clearTimeout(maxTimer);
        clearTimeout(quietTimer);
        resolve();
      };
      try {
        obs = new MutationObserver(() => {
          clearTimeout(quietTimer);
          quietTimer = setTimeout(finish, quietMs);
        });
        obs.observe(document.documentElement || document, {
          childList: true, subtree: true, characterData: false, attributes: false
        });
      } catch (_) {
        resolve();
        return;
      }
      maxTimer = setTimeout(finish, maxMs);
      quietTimer = setTimeout(finish, quietMs);
    });
  }

  async function waitUntil(fn, ms) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      try { if (fn()) return true; } catch (_) {}
      await sleep(80);
    }
    try { return Boolean(fn()); } catch (_) { return false; }
  }

  // ------------------------------------------------------------- editable bul
  function findEditable(target, action) {
    const d = window.__anesDom;
    if (!d) return null;
    const ok = (el) => {
      try {
        return Boolean(el && el.nodeType === 1 && d.isEditable(el) &&
          !d.isSensitive(el) && d.isVisible(el));
      } catch (_) {
        return false;
      }
    };
    const inner = (root) => {
      if (!root || !root.querySelector) return null;
      try {
        return root.querySelector(
          "input:not([type=hidden]),textarea,[contenteditable=''],[contenteditable=true]," +
          "[contenteditable=plaintext-only],[role=searchbox],[role=textbox]");
      } catch (_) {
        return null;
      }
    };
    if (ok(target)) return target;
    if (target) {
      if (ok(target.control)) return target.control;
      const own = inner(target);
      if (ok(own)) return own;
      let parent = target.parentElement;
      for (let i = 0; i < 5 && parent; ++i, parent = parent.parentElement) {
        if (ok(parent)) return parent;
        const q = inner(parent);
        if (ok(q)) return q;
      }
    }
    if (action && action.selector) {
      try {
        for (const el of d.deepQueryAll(action.selector)) if (ok(el)) return el;
      } catch (_) {}
    }
    let all = [];
    try {
      all = d.deepQueryAll(
        "input,textarea,[contenteditable=''],[contenteditable=true]," +
        "[contenteditable=plaintext-only],[role=searchbox],[role=textbox]").filter(ok);
    } catch (_) {
      return null;
    }
    if (!all.length) return null;
    const score = (el) => {
      let s = 0;
      try {
        const role = (el.getAttribute("role") || "").toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();
        const name = fold(d.accessibleName(el) + " " + (el.getAttribute("placeholder") || ""));
        if (role === "searchbox" || type === "search") s += 10;
        if (/ara|search|sorgu|query/.test(name)) s += 6;
        if (d.inViewport(el)) s += 4;
        if ((el.tagName || "").toUpperCase() === "INPUT") s += 2;
      } catch (_) {}
      return s;
    };
    all.sort((a, b) => score(b) - score(a));
    return all[0] || null;
  }

  // --------------------------------------------------------------- katmanlar
  function dismissOverlaysOnce(limit = 2) {
    const d = window.__anesDom;
    if (!d) return 0;
    const scopes = [
      "[role=dialog],[aria-modal=true],tp-yt-paper-dialog,ytd-consent-bump-v2-lightbox," +
      "[id*=consent],[class*=consent],[id*=cookie],[class*=cookie],[class*=modal]",
      "body"
    ];
    let closed = 0;
    const seen = new Set();
    for (const scopeSel of scopes) {
      let scopesFound = [];
      try { scopesFound = d.deepQueryAll(scopeSel); } catch (_) { continue; }
      const roots = scopesFound.length ? scopesFound : [document.body];
      for (const root of roots) {
        if (!root || !root.querySelectorAll) continue;
        let buttons = [];
        try {
          buttons = Array.from(root.querySelectorAll(
            "button,[role=button],a[href],tp-yt-paper-button,input[type=button],input[type=submit]"));
        } catch (_) { continue; }
        for (const btn of buttons) {
          if (closed >= limit) return closed;
          if (seen.has(btn) || !d.isVisible(btn) || d.isDisabled(btn)) continue;
          seen.add(btn);
          const name = (d.accessibleName(btn) || d.visibleText(btn) || "").trim();
          if (!name || name.length > 60) continue;
          if (!DISMISS_RE.test(name)) continue;
          const cls = String(btn.className || "");
          if (/ytp-|player/.test(cls)) continue;
          try {
            btn.click();
            closed += 1;
          } catch (_) {}
        }
      }
      if (closed > 0) break;
    }
    return closed;
  }

  // ---------------------------------------------------------------- tıklama
  async function clickElement(el, type) {
    const d = window.__anesDom;
    if (!el) return { ok: false, code: "target_not_found", message: "Target not found" };
    scrollIntoView(el);
    await sleep(20);
    if (!d.isVisible(el)) return { ok: false, code: "not_supported", message: "Target is not visible" };
    if (d.isDisabled(el)) return { ok: false, code: "disabled", message: "Target is disabled" };
    let cov = d.coveredBy(el);
    if (cov) {
      // Önce engelleyen katmanı kapatmayı dene, sonra aynı hedefe tekrar bak.
      const closed = dismissOverlaysOnce(2);
      if (closed > 0) await sleep(180);
      cov = d.coveredBy(el);
      if (cov) {
        const name = d.accessibleName(cov) || d.visibleText(cov) || cov.tagName;
        return { ok: false, code: "blocked", message: "Target is covered by: " + String(name).slice(0, 120) };
      }
    }
    if (type === "hover") {
      mouse(el, "mouseover");
      mouse(el, "mouseenter", { bubbles: false });
      mouse(el, "mousemove");
      return { ok: true };
    }
    if (type === "rightclick") {
      mouse(el, "mousedown", { button: 2, buttons: 2 });
      mouse(el, "mouseup", { button: 2, buttons: 2 });
      mouse(el, "contextmenu", { button: 2, buttons: 2 });
      return { ok: true };
    }
    if (type === "dblclick") {
      mouse(el, "mousedown");
      mouse(el, "mouseup");
      mouse(el, "click");
      mouse(el, "mousedown");
      mouse(el, "mouseup");
      mouse(el, "click");
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
      return { ok: true };
    }
    const tag = (el.tagName || "").toLowerCase();
    const typeAttr = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    if (tag === "label") {
      const control = el.control || (el.htmlFor ? document.getElementById(el.htmlFor) : null);
      if (control) {
        control.click();
        return { ok: true };
      }
    }
    if (tag === "input" && (typeAttr === "checkbox" || typeAttr === "radio")) {
      el.click();
      return { ok: true };
    }
    try { el.focus({ preventScroll: true }); } catch (_) {}
    mouse(el, "pointerdown");
    mouse(el, "mousedown");
    mouse(el, "pointerup");
    mouse(el, "mouseup");
    mouse(el, "click");
    if (typeof el.click === "function") {
      try { el.click(); } catch (_) {}
    }
    // Sentetik tıklama bazı SPA bağlantılarında gezinme başlatmaz; JS tıklama
    // yeterli olmazsa doğrudan hedef URL'ye git.
    if (tag === "a") {
      const href = String(el.href || "");
      const blank = (el.getAttribute("target") || "").toLowerCase() === "_blank";
      if (!blank && isHttp(href) && location.href === href) return { ok: true };
    }
    return { ok: true };
  }

  // ----------------------------------------------------------------- yazma
  function fire(el, name, init) {
    try {
      el.dispatchEvent(new Event(name, Object.assign({ bubbles: true }, init || {})));
    } catch (_) {}
  }

  async function typeInto(el, action) {
    const d = window.__anesDom;
    if (!el) return { ok: false, code: "target_not_found", message: "Target not found" };
    if (d.isFileInput(el)) {
      return { ok: false, code: "user_action_required", message: "File upload must be done manually" };
    }
    if (d.isSensitive(el)) {
      return { ok: false, code: "sensitive_field_blocked", message: "This field must be filled manually" };
    }
    scrollIntoView(el);
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
    try { el.click(); } catch (_) {}
    await sleep(30);
    const active = document.activeElement;
    if (active !== el && !(el.contains && el.contains(active))) {
      // Koordinat tıklaması ile odağı zorla.
      try {
        const r = el.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
        let top = document.elementFromPoint(x, y);
        if (top && top.shadowRoot) {
          try { top = top.shadowRoot.elementFromPoint(x, y) || top; } catch (_) {}
        }
        if (top && (top === el || el.contains(top) || top.contains(el))) {
          mouse(el, "mousedown");
          mouse(el, "mouseup");
          mouse(el, "click");
        }
      } catch (_) {}
      try { el.focus({ preventScroll: true }); } catch (_) {}
    }

    const text = String(action.text || "");
    const tag = (el.tagName || "").toLowerCase();
    const editable = el.isContentEditable ||
      (el.getAttribute && (el.getAttribute("contenteditable") === "true" ||
                           el.getAttribute("contenteditable") === ""));

    if (editable) {
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, text);
      } catch (_) {}
      if (!inserted) {
        try { document.execCommand("selectAll", false, null); document.execCommand("delete", false, null); } catch (_) {}
        try { el.textContent = text; } catch (_) {}
        try {
          el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        } catch (_) { fire(el, "input"); }
      }
      fire(el, "change");
      const actual = String(el.innerText || el.textContent || "");
      if (text && actual.indexOf(text) < 0 && actual.trim() !== text.trim()) {
        return { ok: false, code: "type_failed", message: "Text could not be entered" };
      }
      if (action.submit === true) await submitAfterType(el);
      return { ok: true };
    }

    if (tag !== "input" && tag !== "textarea") {
      return { ok: false, code: "not_editable", message: "Target does not accept text" };
    }
    const proto = tag === "textarea" ? window.HTMLTextAreaElement.prototype
                                      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const setter = desc && desc.set;
    const apply = (value) => {
      try {
        if (setter) setter.call(el, value);
        else el.value = value;
      } catch (_) {
        try { el.value = value; } catch (__) {}
      }
    };
    try { el.select(); } catch (_) {}
    try { document.execCommand("delete", false, null); } catch (_) {}
    apply("");
    fire(el, "input");
    apply(text);
    fire(el, "input");
    fire(el, "change");
    let actual = String(el.value || "");
    if (text && actual !== text && actual.indexOf(text) < 0) {
      // 2. deneme: execCommand insertText (React/YouTube dahil).
      try {
        el.focus({ preventScroll: true });
        el.select();
        document.execCommand("insertText", false, text);
      } catch (_) {}
      fire(el, "input");
      fire(el, "change");
      actual = String(el.value || "");
    }
    if (text && actual !== text && actual.indexOf(text) < 0) {
      // 3. deneme: son değeri native setter ile yaz.
      apply(text);
      fire(el, "input");
      fire(el, "change");
      actual = String(el.value || "");
    }
    if (text && actual !== text && actual.indexOf(text) < 0) {
      return { ok: false, code: "type_failed", message: "Text could not be entered" };
    }
    if (action.submit === true) await submitAfterType(el);
    return { ok: true };
  }

  async function submitAfterType(el) {
    try {
      const form = el.form || (el.closest && el.closest("form"));
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
        return;
      }
    } catch (_) {}
    el.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
    }));
    el.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
    }));
  }

  async function selectOption(el, action) {
    if (!el) return { ok: false, code: "target_not_found", message: "Target not found" };
    const tag = (el.tagName || "").toLowerCase();
    const wantText = String(action.optionText || "").trim();
    const wantValue = String(action.text || action.value || "").trim();
    if (tag === "select") {
      const options = Array.from(el.options || []);
      let idx = -1;
      if (wantValue) idx = options.findIndex((o) => o.value === wantValue);
      if (idx < 0 && wantText) {
        idx = options.findIndex((o) => (o.textContent || "").trim().toLowerCase() === wantText.toLowerCase());
      }
      if (idx < 0) return { ok: false, code: "target_not_found", message: "Option not found" };
      el.selectedIndex = idx;
      fire(el, "input");
      fire(el, "change");
      return { ok: true };
    }
    const r = await clickElement(el, "click");
    if (!r.ok) return r;
    await sleep(180);
    const d = window.__anesDom;
    const wanted = wantText || wantValue;
    let candidates = [];
    try {
      candidates = d.deepQueryAll("[role=option],[role=menuitem],li,div,span,button,a").filter((node) =>
        d.isVisible(node) &&
        (d.accessibleName(node) || d.visibleText(node)).trim().toLowerCase() === wanted.toLowerCase());
    } catch (_) {}
    if (!candidates.length) return { ok: false, code: "target_not_found", message: "Option not found" };
    return clickElement(candidates[0], "click");
  }

  function keyProps(key) {
    const printable = key.length === 1;
    const code = printable ? "Key" + key.toUpperCase() : key;
    let keyCode = 0;
    if (printable) keyCode = key.toUpperCase().charCodeAt(0);
    else if (key === "Enter") keyCode = 13;
    else if (key === "Tab") keyCode = 9;
    else if (key === "Escape") keyCode = 27;
    else if (key.startsWith("Arrow")) keyCode = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[key] || 0;
    return { key, code, keyCode, which: keyCode, printable };
  }

  async function pressKey(el, action) {
    const raw = String(action.key || "");
    const parts = raw.split("+").map((s) => s.trim()).filter(Boolean);
    const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
    let key = parts.length ? parts[parts.length - 1] : raw;
    for (const p of parts.slice(0, -1)) {
      const l = p.toLowerCase();
      if (l === "ctrl" || l === "control") modifiers.ctrl = true;
      else if (l === "shift") modifiers.shift = true;
      else if (l === "alt") modifiers.alt = true;
      else if (l === "meta" || l === "cmd") modifiers.meta = true;
    }
    if (!key) return { ok: false, code: "not_supported", message: "Key required" };
    const target = el || document.activeElement || document.body;
    try { target.focus({ preventScroll: true }); } catch (_) {}
    if (modifiers.ctrl && key.toLowerCase() === "a") {
      try { document.execCommand("selectAll", false, null); } catch (_) {}
    }
    const info = keyProps(key);
    const init = {
      bubbles: true, cancelable: true, key: info.key, code: info.code,
      keyCode: info.keyCode, which: info.which,
      ctrlKey: modifiers.ctrl, shiftKey: modifiers.shift,
      altKey: modifiers.alt, metaKey: modifiers.meta
    };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    if (info.printable) target.dispatchEvent(new KeyboardEvent("keypress", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
    if (key === "Enter" && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      try { target.form?.requestSubmit?.(); } catch (_) {}
    }
    return { ok: true };
  }

  async function doScroll(action) {
    const d = window.__anesDom;
    if (action.target) {
      const el = d.byId(action.target);
      if (!el) return { ok: false, code: "target_not_found", message: "Target not found" };
      scrollIntoView(el);
      return { ok: true };
    }
    const amount = Number(action.amount) || 600;
    const dy = action.direction === "up" ? -amount : amount;
    window.scrollBy({ top: dy, left: 0, behavior: "instant" });
    return { ok: true };
  }

  async function doWait(action) {
    const d = window.__anesDom;
    const timeout = Math.max(100, Math.min(30000, Number(action.timeoutMs) || 5000));
    const started = Date.now();
    const hasCondition = Boolean(action.selector || action.text || action.urlIncludes);
    if (!hasCondition) {
      await sleep(timeout);
      return { ok: true };
    }
    while (Date.now() - started < timeout) {
      if (action.selector) {
        try {
          const found = d.deepQueryAll(action.selector).some((el) => d.isVisible(el));
          if (found) return { ok: true };
        } catch (_) {}
      }
      if (action.text) {
        const body = document.body ? (document.body.innerText || "") : "";
        if (body.toLowerCase().includes(String(action.text).toLowerCase())) return { ok: true };
      }
      if (action.urlIncludes && location.href.includes(action.urlIncludes)) return { ok: true };
      await sleep(100);
    }
    return { ok: false, code: "timeout", message: "Wait timed out" };
  }

  function wantsComments(action) {
    const target = String(action.target || "").toLowerCase();
    const selector = String(action.selector || "").toLowerCase();
    const what = String(action.what || "").toLowerCase();
    return what === "comments" || target === "comments" ||
           selector.indexOf("comment") >= 0 || selector.indexOf("yorum") >= 0;
  }

  async function doExtract(action) {
    const d = window.__anesDom;
    // K-406: yorum hedefi geldiyse ham querySelectorAll yerine yapısal
    // collectComments kullan. YouTube yorumları gecikmeli yüklenir; en az
    // 5 yorum için 800 ms sessizlik bekle, en fazla 2 tur dene.
    if (wantsComments(action)) {
      let data = d.collectComments();
      for (let round = 0; round < 2 && data.length < 5; round += 1) {
        await waitForQuiet(800, 140);
        data = d.collectComments();
      }
      return { ok: true, data };
    }
    let el = null;
    let els = [];
    if (action.selector) {
      try { els = d.deepQueryAll(action.selector).slice(0, 20); } catch (_) {}
      el = els[0] || null;
    }
    if (!el && action.target) el = d.byId(action.target);
    if (!el) el = document.body;
    if (!el) return { ok: false, code: "target_not_found", message: "Target not found" };
    let data = null;
    if (els.length > 1 && !action.what) {
      data = els.map((e) => d.cleanText(e.innerText || e.textContent || "", 1200))
                .filter((t) => t.length > 0);
    } else if (action.what === "value") {
      data = d.isSensitive(el) ? "***" : String(el.value ?? "");
    } else if (action.what === "attribute") {
      data = action.attribute ? String(el.getAttribute(action.attribute) ?? "") : "";
    } else if (action.what === "table") {
      const table = el.closest ? (el.closest("table") || el) : el;
      const rows = [];
      table.querySelectorAll("tr").forEach((tr) => {
        if (rows.length >= 100) return;
        const cells = [];
        tr.querySelectorAll("th,td").forEach((td) => {
          if (cells.length < 20) cells.push(d.cleanText(td.innerText || td.textContent || "", 1000));
        });
        if (cells.length) rows.push(cells);
      });
      data = rows;
    } else if (action.what === "links") {
      const links = [];
      el.querySelectorAll("a[href]").forEach((a) => {
        if (links.length >= 200) return;
        links.push({ text: d.cleanText(a.innerText || a.textContent || "", 300), href: String(a.href || "") });
      });
      data = links;
    } else {
      data = d.cleanText(el.innerText || el.textContent || "", 20000);
    }
    return { ok: true, data };
  }

  // ---------------------------------------------------------------- playbook
  async function playbookEnsurePlaying() {
    const d = window.__anesDom;
    let video = null;
    try {
      const nodes = d.deepQueryAll("video");
      video = nodes.find((v) => v.tagName === "VIDEO" && (v.currentSrc || v.src)) ||
              nodes.find((v) => v.tagName === "VIDEO") || null;
    } catch (_) {}
    if (!video) return { ok: false, code: "target_not_found", message: "Video not found" };

    const skip = document.querySelector(
      ".ytp-ad-skip-button,.ytp-skip-ad-button,button.ytp-ad-skip-button-modern");
    if (skip) {
      try { skip.click(); } catch (_) {}
      await sleep(200);
    }
    if (video.paused) {
      const play = document.querySelector(
        ".ytp-play-button,button[aria-label*='Play'],button[aria-label*='Oynat']," +
        "button[aria-label*='oynat'],button[aria-label*='play']");
      if (play) {
        try { play.click(); } catch (_) {}
        await sleep(150);
      }
      if (video.paused) {
        try { await video.play(); } catch (_) {}
      }
    }
    const t0 = Number(video.currentTime) || 0;
    await waitUntil(() => !video.paused || video.currentTime > t0, 1500);
    const media = d.collectMedia();
    return {
      ok: true,
      data: {
        playing: Boolean(!video.paused && !video.ended),
        adShowing: Boolean(media.adShowing),
        title: media.title,
        url: location.href
      }
    };
  }

  function videoCandidates() {
    const d = window.__anesDom;
    const out = [];
    const seen = new Set();
    let anchors = [];
    try {
      anchors = d.deepQueryAll(
        "a[href*='/watch?v='],ytd-video-renderer a#video-title,ytd-video-renderer a#video-title-link," +
        "ytd-rich-item-renderer a#video-title-link,ytd-compact-video-renderer a#video-title");
    } catch (_) {}
    for (const anchor of anchors) {
      const href = String(anchor.href || "");
      if (!/youtube\.com\/watch\?/i.test(href)) continue;
      if (!/[?&]v=/.test(href)) continue;
      if (/[?&]list=/.test(href)) continue;
      if (/\/shorts\//i.test(href)) continue;
      const renderer = anchor.closest(
        "ytd-video-renderer,ytd-rich-item-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer");
      if (!renderer || !d.isVisible(renderer)) continue;
      if (renderer.matches(
        "ytd-ad-slot-renderer,ytd-promoted-sparkles-web-renderer,ytd-display-ad-renderer," +
        "ytd-in-feed-ad-layout-renderer")) continue;
      const badgeEl = renderer.querySelector(
        "ytd-badge-supported-renderer,ytd-ad-slot-renderer,.badge-shape-wiz__text");
      if (badgeEl) {
        const badge = fold(badgeEl.innerText || badgeEl.textContent || "");
        if (/\b(ad|ads|reklam|sponsorlu|sponsored)\b/.test(badge)) continue;
      }
      const titleEl = renderer.querySelector(
        "a#video-title,a#video-title-link,#video-title,h3 a,yt-formatted-string#video-title");
      if (!titleEl) continue;
      let title = String(titleEl.getAttribute("title") || titleEl.innerText || titleEl.textContent || "").trim();
      if (!title) title = String(anchor.getAttribute("aria-label") || "").trim();
      if (!title) continue;
      if (/\bshorts\b/i.test(title)) continue;
      const key = href.replace(/[?&](t|start_radio|index|pp)=[^&]*/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ anchor, title, href, order: out.length });
    }
    out.sort((a, b) => a.order - b.order);
    return out;
  }

  function matchScore(title, query) {
    const nt = fold(title);
    const nq = fold(query);
    if (!nt || !nq) return 0;
    let score = 0;
    if (nt.indexOf(nq) >= 0) score += 20;
    for (const tok of nq.split(" ")) {
      if (tok.length >= 2 && nt.indexOf(tok) >= 0) score += 4;
    }
    return score;
  }

  async function playbookYoutubePick(action) {
    const candidates = videoCandidates();
    if (!candidates.length) return { ok: false, code: "no_results", message: "No video results found" };
    const selection = String(action.selection || "").toLowerCase();
    const wanted = String(action.query || "");
    let index = 0;
    if (selection === "first") index = 0;
    else if (selection === "second") index = Math.min(1, candidates.length - 1);
    else if (selection === "third") index = Math.min(2, candidates.length - 1);
    else if (selection === "fourth") index = Math.min(3, candidates.length - 1);
    else if (selection === "fifth") index = Math.min(4, candidates.length - 1);
    else if (selection === "last") index = candidates.length - 1;
    else if (selection !== "newest" && selection !== "cheapest" && selection !== "best" && wanted) {
      let best = 0;
      let bestScore = -1;
      candidates.forEach((c, i) => {
        const s = matchScore(c.title, wanted);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      index = bestScore > 0 ? best : 0;
    }
    const picked = candidates[index];
    const beforeUrl = location.href;
    let clicked = await clickElement(picked.anchor, "click");
    if (!clicked.ok) clicked = { ok: true };
    const navigated = await waitUntil(() => location.href !== beforeUrl, 1200);
    if (!navigated) {
      try { location.assign(picked.href); } catch (_) {}
    }
    return {
      ok: true,
      navigated: true,
      data: { title: picked.title, url: picked.href, index }
    };
  }

  async function playbookDismissOverlays() {
    let closed = dismissOverlaysOnce(3);
    if (closed === 0) {
      // YouTube consent bump özel durumu.
      const bump = document.querySelector("ytd-consent-bump-v2-lightbox");
      if (bump) {
        const btn = bump.querySelector("tp-yt-paper-button, button");
        if (btn) {
          try { btn.click(); closed += 1; } catch (_) {}
        }
      }
    }
    if (closed > 0) await sleep(180);
    return { ok: true, data: { closed } };
  }

  async function playbookYoutubeStep(action) {
    const name = String(action.name || "");
    const back = name.indexOf("previous") >= 0;
    const count = Math.max(1, Math.min(10, Number(action.count) || 1));
    const nextSel = ".ytp-next-button,a.ytp-next-button,button[aria-label*='Next']," +
      "button[aria-label*='Sonraki'],button[title*='Next'],button[title*='Sonraki']";
    const prevSel = ".ytp-prev-button,a.ytp-prev-button,button[aria-label*='Previous']," +
      "button[aria-label*='Önceki'],button[title*='Previous'],button[title*='Önceki']";
    let skipped = 0;
    for (let i = 0; i < count; i += 1) {
      const btn = document.querySelector(back ? prevSel : nextSel);
      if (!btn) break;
      const url0 = location.href;
      try { btn.click(); } catch (_) { break; }
      skipped += 1;
      await waitUntil(() => {
        if (location.href !== url0) return true;
        const m = window.__anesDom.collectMedia();
        return m.currentTime < 2.5 && !m.paused;
      }, 2500);
      await sleep(220);
    }
    // Oynatıcı düğmesi yoksa (ör. kuyruk paneli) seçili öğeden count kadar ilerle.
    if (skipped === 0) {
      const items = Array.from(document.querySelectorAll("ytd-playlist-panel-video-renderer"));
      if (items.length) {
        let sel = items.findIndex((el) => el.hasAttribute("selected") ||
          el.getAttribute("aria-current") === "true" ||
          Boolean(el.querySelector("[selected]")));
        if (sel < 0) sel = 0;
        const idx = Math.max(0, Math.min(items.length - 1, sel + (back ? -count : count)));
        const target = items[idx];
        const a = target.querySelector("a#wc-endpoint,a#thumbnail,a");
        try { (a || target).click(); } catch (_) {}
        skipped = 1;
        await sleep(900);
      }
    }
    const ensure = await playbookEnsurePlaying();
    const media = window.__anesDom.collectMedia();
    return {
      ok: true,
      navigated: skipped > 0,
      data: {
        requested: count,
        skipped,
        direction: back ? "previous" : "next",
        title: media.title,
        url: location.href,
        playing: Boolean(ensure && ensure.data && ensure.data.playing) || Boolean(media.playing)
      }
    };
  }

  async function runPlaybook(action) {
    const name = String(action.name || "");
    if (name === "youtube_pick") return playbookYoutubePick(action);
    if (name === "ensure_playing") return playbookEnsurePlaying(action);
    if (name === "youtube_next" || name === "youtube_previous") return playbookYoutubeStep(action);
    if (name === "dismiss_overlays") return playbookDismissOverlays(action);
    return { ok: false, code: "not_supported", message: "Unknown playbook" };
  }

  async function run(action, expectedSnapshotId) {
    if (!action || typeof action !== "object") {
      return resultErr(action, "", "not_supported", "Invalid action");
    }
    if (!ALLOWED.has(action.type)) {
      return resultErr(action, expectedSnapshotId, "not_supported", "Unknown action type");
    }
    const d = window.__anesDom;
    if (!d) return resultErr(action, expectedSnapshotId, "not_supported", "Page is not ready");
    const current = d.getSnapshotId();
    if (!URL_SAFE.has(action.type) && expectedSnapshotId && current && expectedSnapshotId !== current) {
      return resultErr(action, expectedSnapshotId, "stale_snapshot", "Snapshot is stale");
    }
    const started = Date.now();
    const before = signature();
    let res = { ok: true };
    let target = action.target ? d.byId(action.target) : null;

    try {
      if (!target && action.selector && action.type !== "playbook") {
        try {
          target = d.deepQueryAll(action.selector).find((el) => d.isVisible(el)) || null;
        } catch (_) {}
      }

      if (action.type === "playbook") {
        res = await runPlaybook(action);
      } else if (action.type === "click" || action.type === "dblclick" ||
                 action.type === "hover" || action.type === "rightclick") {
        res = await clickElement(target, action.type);
        if (res.ok && action.type === "click" && target) {
          const tag = (target.tagName || "").toLowerCase();
          const href = String(target.href || "");
          const blank = (target.getAttribute("target") || "").toLowerCase() === "_blank";
          if (tag === "a" && !blank && isHttp(href)) {
            const nav = await waitUntil(() => location.href !== before.url, 700);
            if (!nav) {
              try { location.assign(href); res.navigated = true; } catch (_) {}
            }
          }
        }
      } else if (action.type === "type") {
        const editable = findEditable(target, action);
        if (!editable) {
          res = { ok: false, code: "not_editable", message: "No editable field found" };
        } else {
          res = await typeInto(editable, action);
        }
      } else if (action.type === "select") {
        res = await selectOption(target, action);
      } else if (action.type === "check" || action.type === "uncheck") {
        if (!target) res = { ok: false, code: "target_not_found", message: "Target not found" };
        else {
          const want = action.type === "check";
          if (Boolean(target.checked) !== want) {
            scrollIntoView(target);
            target.click();
          }
          res = { ok: true };
        }
      } else if (action.type === "press") {
        res = await pressKey(target, action);
      } else if (action.type === "scroll") {
        res = await doScroll(action);
      } else if (action.type === "navigate") {
        if (!isHttp(action.url)) res = { ok: false, code: "not_supported", message: "Only http/https allowed" };
        else {
          location.href = action.url;
          res = { ok: true, navigated: true };
        }
      } else if (action.type === "back") {
        history.back(); res = { ok: true, navigated: true };
      } else if (action.type === "forward") {
        history.forward(); res = { ok: true, navigated: true };
      } else if (action.type === "reload") {
        location.reload(); res = { ok: true, navigated: true };
      } else if (action.type === "wait") {
        res = await doWait(action);
      } else if (action.type === "extract") {
        res = await doExtract(action);
      } else if (action.type === "screenshot") {
        res = { ok: false, code: "not_supported", message: "Screenshot is disabled" };
      }
    } catch (_) {
      res = { ok: false, code: "script_error", message: "Action could not be completed" };
    }

    if (!res.ok) return resultErr(action, expectedSnapshotId, res.code || "not_supported", res.message);

    if (action.type === "click" || action.type === "type" ||
        action.type === "select" || action.type === "press") {
      await waitForQuiet(600, 140);
    } else if (action.type === "scroll") {
      // Kaydırmadan sonra YouTube gibi siteler içeriği geç yükler.
      await sleep(500);
    }
    const after = signature();
    const urlChanged = after.url !== before.url;
    const focusChanged = after.focus !== before.focus;
    const changed = urlChanged || focusChanged || after.textLen !== before.textLen;
    return resultOk(action, expectedSnapshotId, started, changed, {
      urlChanged, focusChanged,
      navigated: res.navigated === true || urlChanged,
      data: res.data ?? null,
      message: action.description || res.message || "Done"
    });
  }

  window.__anesActions = { run };
})();
