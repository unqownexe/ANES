// ANES Browser Agent — popup durum göstergesi.
const $ = (id) => document.getElementById(id);

function shortGoal(goal) {
  const s = String(goal || "").replace(/\s+/g, " ").trim();
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname.slice(0, 34) : "");
  } catch (_) {
    return String(url || "—");
  }
}

function render(st) {
  const dot = $("dot");
  const title = $("statusTitle");
  const text = $("statusText");
  dot.className = "dot";
  if (st.connected) {
    dot.classList.add("on");
    title.textContent = st.controlEnabled ? "ANES bağlı" : "Tarayıcı Kontrolü kapalı";
    text.textContent = st.controlEnabled
      ? "Spotlight AI bu sekmeyi yönetebilir. Görev yalnız AI istediğinde başlar."
      : "ANES > Ayarlar > AI > Tarayıcı Kontrolü'nü açın.";
  } else {
    dot.classList.add(st.nativeError ? "off" : "wait");
    title.textContent = "ANES kapalı";
    text.textContent = st.nativeError ||
      "ANES'i açın ve Ayarlar > AI > Tarayıcı Kontrolü'nü etkinleştirin.";
  }

  if (st.task && st.task.status !== "stopped" && st.task.status !== "done") {
    $("taskText").textContent =
      `${shortGoal(st.task.goal)} · ${st.task.steps}/${st.task.maxSteps}`;
  } else {
    $("taskText").textContent = "Yok";
  }

  if (st.tab && st.tab.url) {
    $("tabText").textContent = shortUrl(st.tab.url);
    $("tabText").title = st.tab.url;
  } else {
    $("tabText").textContent = "—";
    $("tabText").title = "";
  }

  $("idText").textContent = st.extensionId || "—";
  $("idText").title = st.extensionId || "";
}

async function refresh() {
  try {
    const st = await chrome.runtime.sendMessage({ type: "anes:popup_status" });
    if (st) render(st);
  } catch (_) {
    render({ connected: false, nativeError: "Eklenti arka planına ulaşılamadı." });
  }
}

$("reconnect").addEventListener("click", async () => {
  $("statusTitle").textContent = "Bağlanıyor…";
  try { await chrome.runtime.sendMessage({ type: "anes:popup_reconnect" }); } catch (_) {}
  setTimeout(refresh, 500);
  setTimeout(refresh, 1600);
});

$("options").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "anes:popup_options" });
  window.close();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "anes:status_changed") refresh();
});

refresh();
setInterval(refresh, 1000);
