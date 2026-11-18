// ANES Browser Agent — ayrıntılar sayfası.
const $ = (id) => document.getElementById(id);

function render(st) {
  const dot = $("dot");
  dot.className = "dot";
  if (st.connected) {
    dot.classList.add("on");
    $("statusTitle").textContent = st.controlEnabled ? "ANES bağlı" : "Tarayıcı Kontrolü kapalı";
    $("statusText").textContent = st.controlEnabled
      ? "Köprü hazır. Spotlight AI bir görev başlattığında eylemler bu tarayıcıda uygulanır."
      : "ANES > Ayarlar > AI > Tarayıcı Kontrolü'nü etkinleştirin.";
  } else {
    dot.classList.add(st.nativeError ? "off" : "wait");
    $("statusTitle").textContent = "ANES kapalı";
    $("statusText").textContent = st.nativeError ||
      "ANES'i açın ve Ayarlar > AI > Tarayıcı Kontrolü'nü etkinleştirin.";
  }
  $("extId").textContent = st.extensionId || "—";
  $("extVersion").textContent = st.version || "—";
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
  setTimeout(refresh, 600);
  setTimeout(refresh, 1800);
});

$("extensions").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "anes:status_changed") refresh();
});
refresh();
setInterval(refresh, 2000);
