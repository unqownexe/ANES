// ANES Browser Agent — DOM yardımcıları (izole dünya).
(function () {
  "use strict";
  if (window.__anesDom) return;

  const SENSITIVE_RE = /(pass(word)?|card|cc-|cvv|cvc|ssn|social|token|secret|iban)/i;
  const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  const idByEl = new WeakMap();
  const elById = new Map();
  let seq = 0;
  let snapshotId = "";
  let snapshotAt = 0;

  function reset(sid) {
    elById.clear();
    seq = 0;
    snapshotId = sid || "";
    snapshotAt = Date.now();
  }

  function idOf(el) {
    let id = idByEl.get(el);
    if (!id) {
      id = `el-${++seq}`;
      idByEl.set(el, id);
      elById.set(id, el);
    }
    return id;
  }

  function byId(id) {
    return elById.get(id) || null;
  }

  function cleanText(value, max = 400) {
    if (typeof value !== "string") return "";
    const s = value.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function visibleText(el) {
    if (!el) return "";
    try {
      return cleanText(el.innerText || el.textContent || "", 400);
    } catch (_) {
      return "";
    }
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" ||
          style.visibility === "collapse" || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (r.bottom < -2000 || r.top > (innerHeight || 0) + 2000) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function inViewport(el) {
    try {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    } catch (_) {
      return false;
    }
  }

  function rectOf(el) {
    try {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height)
      };
    } catch (_) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
  }

  function labelText(el) {
    try {
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) return visibleText(lab);
      }
      const wrap = el.closest && el.closest("label");
      if (wrap) return visibleText(wrap);
    } catch (_) {}
    return "";
  }

  function accessibleName(el) {
    if (!el) return "";
    const attrs = ["aria-label"];
    for (const a of attrs) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && v.trim()) return cleanText(v, 300);
    }
    const labelled = el.getAttribute && el.getAttribute("aria-labelledby");
    if (labelled) {
      const parts = labelled.split(/\s+/).map((id) => {
        const n = document.getElementById(id);
        return n ? visibleText(n) : "";
      }).filter(Boolean);
      if (parts.length) return cleanText(parts.join(" "), 300);
    }
    const lab = labelText(el);
    if (lab) return lab;
    const ph = el.getAttribute && (el.getAttribute("placeholder") || el.getAttribute("title"));
    if (ph && ph.trim()) return cleanText(ph, 300);
    const alt = el.getAttribute && el.getAttribute("alt");
    if (alt && alt.trim()) return cleanText(alt, 300);
    const txt = visibleText(el);
    if (txt) return txt;
    if (typeof el.value === "string" && el.value.trim()) return cleanText(el.value, 300);
    return "";
  }

  function roleOf(el) {
    const explicit = el.getAttribute && el.getAttribute("role");
    if (explicit) return explicit.trim().toLowerCase();
    const tag = (el.tagName || "").toLowerCase();
    const type = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      if (type === "checkbox" || type === "radio") return type;
      if (type === "submit" || type === "button" || type === "reset") return "button";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    if (tag === "summary") return "button";
    if (tag === "dialog") return "dialog";
    if (/^h[1-6]$/.test(tag)) return "heading";
    return "generic";
  }

  function isSensitive(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "password") return true;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac.startsWith("cc-")) return true;
    const ident = `${el.id || ""} ${el.getAttribute("name") || ""}`;
    return SENSITIVE_RE.test(ident);
  }

  function isFileInput(el) {
    return el && el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "file";
  }

  function isDisabled(el) {
    try {
      return Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true";
    } catch (_) {
      return false;
    }
  }

  function inShadow(el) {
    try {
      return Boolean(el.getRootNode && el.getRootNode() instanceof ShadowRoot);
    } catch (_) {
      return false;
    }
  }

  // Açık shadow root'ları da tarayan sorgu (kapalı shadow root'a erişilmez).
  function shadowRoots(root = document) {
    const out = [];
    const seen = new Set();
    function walk(node) {
      if (!node || !node.querySelectorAll) return;
      let all = [];
      try { all = node.querySelectorAll("*"); } catch (_) { return; }
      for (const el of all) {
        if (el.shadowRoot && !seen.has(el.shadowRoot)) {
          seen.add(el.shadowRoot);
          out.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    }
    walk(root);
    return out;
  }

  function deepQueryAll(selector, root = document) {
    const out = [];
    const seen = new Set();
    const roots = [root].concat(root === document ? shadowRoots(document) : shadowRoots(root));
    for (const r of roots) {
      let nodes = [];
      try { nodes = r.querySelectorAll(selector); } catch (_) { continue; }
      for (const n of nodes) {
        if (!seen.has(n)) { seen.add(n); out.push(n); }
      }
    }
    return out;
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || "").toLowerCase();
    const type = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    const role = (el.getAttribute && el.getAttribute("role") || "").toLowerCase();
    if (el.disabled || el.readOnly) return false;
    if (el.isContentEditable ||
        (el.getAttribute && el.getAttribute("contenteditable") === "true") ||
        (el.getAttribute && el.getAttribute("contenteditable") === "")) return true;
    if (tag === "textarea") return true;
    if (tag === "input") {
      if (["button", "submit", "reset", "checkbox", "radio", "file", "image",
           "range", "color", "hidden"].includes(type)) return false;
      return true;
    }
    return role === "textbox" || role === "searchbox" || role === "combobox";
  }

  function coveredBy(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      // Shadow DOM içindeki öğeler için elementFromPoint doğru kökten çağrılmalı.
      let root = document;
      try {
        const rn = el.getRootNode && el.getRootNode();
        if (rn && rn instanceof ShadowRoot && rn.elementFromPoint) root = rn;
      } catch (_) {}
      let top = root.elementFromPoint(x, y);
      // Açık shadow host'a denk geldiyse içine in.
      let guard = 0;
      while (top && top.shadowRoot && guard++ < 3) {
        let inner = null;
        try { inner = top.shadowRoot.elementFromPoint(x, y); } catch (_) {}
        if (!inner || inner === top) break;
        top = inner;
      }
      if (!top || top === el || el.contains(top) || top.contains(el)) return null;
      return top;
    } catch (_) {
      return null;
    }
  }

  function collectText(maxChars) {
    try {
      if (!document.body) return "";
      const text = String(document.body.innerText || document.body.textContent || "")
        .replace(CONTROL_RE, " ").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n");
      if (text.length <= maxChars) return text;
      // K-403: YouTube gibi uzun sayfalarda ilk N karakter yalnız üst bölümü
      // (başlık/açıklama) içeriyordu; yorumlar hiç görünmüyordu. Kaydırma
      // oranına göre metnin o anki bölümünü pencerele.
      const doc = document.documentElement || {};
      const maxScroll = Math.max(1, (doc.scrollHeight || 0) - (window.innerHeight || 0));
      const ratio = Math.max(0, Math.min(1, (window.scrollY || 0) / maxScroll));
      const center = Math.floor(ratio * text.length);
      let start = Math.max(0, center - Math.floor(maxChars * 0.35));
      if (start + maxChars > text.length) start = text.length - maxChars;
      return text.slice(start, start + maxChars);
    } catch (_) {
      return "";
    }
  }

  // K-403/K-406: yaygın yorum bileşenlerinden ilk 20 yorumu topla.
  // YouTube yorumları yeni DOM'da ytd-comment-view-model içinde ve bazen açık
  // shadow root altında gelir; bu yüzden deepQueryAll (getRootNode dolaşımı)
  // kullanılır. Son kullanılan seçici log için saklanır.
  let lastCommentSelector = "";
  function commentTextOf(el, selector) {
    if (!el) return null;
    let nodes = [];
    try { nodes = deepQueryAll(selector, el); } catch (_) { nodes = []; }
    if (!nodes.length && el.querySelector) {
      try { nodes = el.querySelectorAll(selector); } catch (_) { nodes = []; }
    }
    for (const n of nodes) {
      if (n === el) continue;
      return n;
    }
    return nodes[0] || null;
  }

  function collectComments() {
    const out = [];
    const seen = new Set();
    const selectors = [
      "ytd-comment-thread-renderer",
      "ytd-comment-view-model",
      "ytd-comment-renderer",
      "[data-testid=comment]",
      "article[data-testid=comment]",
      ".comment"
    ];
    const textSelectors = [
      "#content-text",
      "yt-attributed-string#content-text",
      "ytd-comment-view-model #content-text",
      "[data-testid=comment-content]",
      ".comment-content"
    ];
    const authorSelectors = [
      "#author-text",
      "ytd-comment-view-model #author-text",
      "[data-testid=comment-author]",
      ".comment-author"
    ];
    const likeSelectors = [
      "#vote-count-middle",
      "[data-testid=comment-like-count]",
      ".like-count"
    ];
    lastCommentSelector = "";
    for (const sel of selectors) {
      let nodes = [];
      try { nodes = deepQueryAll(sel, document); } catch (_) { continue; }
      let checked = 0;
      for (const el of nodes) {
        if (out.length >= 20 || ++checked > 200) break;
        if (seen.has(el)) continue;
        let nested = false;
        for (const prev of seen) {
          if (prev !== el && prev.contains && prev.contains(el)) { nested = true; break; }
        }
        seen.add(el);
        if (nested) continue;
        let textEl = null;
        for (const ts of textSelectors) {
          textEl = commentTextOf(el, ts);
          if (textEl) break;
        }
        const authorEl = (() => {
          for (const as of authorSelectors) {
            const n = commentTextOf(el, as);
            if (n) return n;
          }
          return null;
        })();
        const likeEl = (() => {
          for (const ls of likeSelectors) {
            const n = commentTextOf(el, ls);
            if (n) return n;
          }
          return null;
        })();
        const text = cleanText(textEl ? (textEl.innerText || textEl.textContent) : (el.innerText || ""), 1200);
        if (!text) continue;
        out.push({
          author: cleanText(authorEl ? (authorEl.innerText || authorEl.textContent) : "", 120),
          text,
          likes: cleanText(likeEl ? (likeEl.innerText || likeEl.textContent) : "", 40)
        });
        if (!lastCommentSelector) lastCommentSelector = sel;
      }
      if (out.length >= 20) break;
    }
    return out;
  }

  function collectHeadings() {
    const out = [];
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]").forEach((el) => {
      if (out.length >= 60) return;
      if (!isVisible(el)) return;
      const text = visibleText(el);
      if (!text) return;
      const m = /^h([1-6])$/i.exec(el.tagName || "");
      const level = m ? Number(m[1]) : Number(el.getAttribute("aria-level") || 2);
      out.push({ level, text });
    });
    return out;
  }

  function interactiveCandidates() {
    const sel = [
      "a[href]", "button", "input", "select", "textarea", "summary",
      "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]",
      "[role=tab]", "[role=menuitem]", "[role=option]", "[role=switch]",
      "[role=searchbox]", "[role=textbox]",
      "[contenteditable=true]", "[contenteditable='']", "[contenteditable=plaintext-only]",
      "[tabindex]"
    ].join(",");
    return deepQueryAll(sel);
  }

  function elementInfo(el, order) {
    const tag = (el.tagName || "").toLowerCase();
    const type = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
    const sensitive = isSensitive(el);
    const covered = coveredBy(el);
    let value = "";
    if (tag === "input" || tag === "textarea" || tag === "select") {
      value = sensitive ? "***" : cleanText(String(el.value || ""), 300);
    }
    return {
      id: idOf(el),
      frameId: 0,
      tag,
      role: roleOf(el),
      name: accessibleName(el),
      text: visibleText(el),
      href: tag === "a" ? cleanText(el.href || "", 1000) : "",
      value,
      placeholder: cleanText(el.getAttribute && el.getAttribute("placeholder") || "", 200),
      type,
      checked: (type === "checkbox" || type === "radio") ? Boolean(el.checked) : null,
      disabled: isDisabled(el),
      editable: isEditable(el),
      visible: isVisible(el),
      inViewport: inViewport(el),
      covered: Boolean(covered),
      coveredBy: covered ? (accessibleName(covered) || visibleText(covered) || (covered.tagName || "").toLowerCase()).slice(0, 120) : "",
      shadow: inShadow(el),
      order: Number.isInteger(order) ? order : 0,
      rect: rectOf(el),
      context: ""
    };
  }

  function collectInteractive(limit) {
    const items = [];
    const all = interactiveCandidates();
    const visIn = [];
    const vis = [];
    const rest = [];
    const seen = new Set();
    for (const el of all) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (isVisible(el)) {
        (inViewport(el) ? visIn : vis).push(el);
      } else {
        rest.push(el);
      }
    }
    const ordered = visIn.concat(vis, rest);
    const truncated = ordered.length > limit;
    let order = 0;
    for (const el of ordered) {
      if (items.length >= limit) break;
      const info = elementInfo(el, order++);
      if (!info.visible && items.length > limit * 0.8) continue;
      items.push(info);
    }
    return { items, truncated };
  }

  // Oynatıcı durumu (video/audio). YouTube reklam katmanı ayrıca işaretlenir.
  function collectMedia() {
    const nodes = deepQueryAll("video,audio");
    const media = nodes.filter((el) => {
      try {
        return el.readyState > 0 || Boolean(el.currentSrc || el.src || el.srcObject);
      } catch (_) {
        return false;
      }
    });
    const video = media.find((el) => el.tagName === "VIDEO" && !el.paused) ||
                  media.find((el) => el.tagName === "VIDEO") || media[0] || null;
    let title = "";
    try {
      const h = document.querySelector(
        "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, " +
        "ytd-watch-metadata #title h1, h1.ytd-video-primary-info-renderer");
      if (h) title = cleanText(h.innerText || h.textContent || "", 300);
      if (!title) title = cleanText(document.title || "", 300).replace(/\s*-\s*YouTube\s*$/i, "");
    } catch (_) {}
    let adShowing = false;
    try {
      adShowing = Boolean(document.querySelector(
        "#movie_player.ad-showing,.ytp-ad-player-overlay,.ytp-ad-showing,.ytp-ad-module .ytp-ad-player-overlay-layout"));
    } catch (_) {}
    return {
      count: media.length,
      playing: video ? (!video.paused && !video.ended) : false,
      paused: video ? video.paused : true,
      muted: video ? Boolean(video.muted) : false,
      ended: video ? Boolean(video.ended) : false,
      currentTime: video ? Math.round((video.currentTime || 0) * 10) / 10 : 0,
      duration: video ? Math.round((video.duration || 0) * 10) / 10 : 0,
      adShowing,
      title,
      url: String(location.href || "")
    };
  }

  function collectForms() {
    const forms = [];
    document.querySelectorAll("form").forEach((form) => {
      if (forms.length >= 30) return;
      const fields = [];
      form.querySelectorAll("input,select,textarea,button").forEach((el) => {
        if (fields.length >= 20) return;
        const info = elementInfo(el);
        fields.push({
          id: info.id, tag: info.tag, type: info.type, name: info.name,
          value: info.value, sensitive: isSensitive(el), required: Boolean(el.required)
        });
      });
      forms.push({
        name: accessibleName(form) || cleanText(form.id || "", 120),
        action: cleanText(form.action || "", 500),
        fields
      });
    });
    return forms;
  }

  function collectDialogs() {
    const out = [];
    document.querySelectorAll("dialog,[role=dialog],[aria-modal=true]").forEach((el) => {
      if (out.length >= 10) return;
      if (!isVisible(el)) return;
      out.push(cleanText(accessibleName(el) || visibleText(el), 500));
    });
    return out;
  }

  function collectAlerts() {
    const out = [];
    document.querySelectorAll("[role=alert],[aria-live=assertive],[aria-live=polite]").forEach((el) => {
      if (out.length >= 10) return;
      if (!isVisible(el)) return;
      const t = visibleText(el);
      if (t) out.push(t);
    });
    return out;
  }

  function flags() {
    const bodyText = cleanText(document.body ? document.body.innerText : "", 4000).toLowerCase();
    const captcha = Boolean(document.querySelector(
      "iframe[src*='recaptcha'],iframe[src*='hcaptcha'],.g-recaptcha,.h-captcha,[data-sitekey]"))
      || /captcha|robot değil|not a robot/.test(bodyText);
    const pw = document.querySelector("input[type=password]");
    const loginWall = Boolean(pw && isVisible(pw)) ||
      /(sign in|log in|login|giriş yap|oturum aç)/.test(bodyText.slice(0, 1500));
    const cookieBanner = Boolean(document.querySelector(
      "[id*=cookie],[class*=cookie],[id*=consent],[class*=consent]"));
    return { captcha, loginWall, cookieBanner, truncated: false };
  }

  function focusedId() {
    const el = document.activeElement;
    if (!el || el === document.body) return "";
    return idByEl.get(el) || "";
  }

  window.__anesDom = {
    reset, idOf, byId, cleanText, visibleText, isVisible, inViewport, rectOf,
    accessibleName, roleOf, isSensitive, isFileInput, isDisabled, inShadow,
    shadowRoots, deepQueryAll, isEditable, coveredBy, collectText, collectHeadings,
    collectInteractive, collectForms, collectDialogs, collectAlerts, collectComments,
    lastCommentsSelector: () => lastCommentSelector,
    collectMedia, flags, focusedId,
    getSnapshotId: () => snapshotId,
    setSnapshotId: (v) => { snapshotId = v; snapshotAt = Date.now(); },
    snapshotAge: () => Date.now() - snapshotAt
  };
})();
