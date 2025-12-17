(function () {
  const tg = window.Telegram?.WebApp;

  const elName = document.getElementById("name");
  const elUid = document.getElementById("uid");
  const elTheme = document.getElementById("theme");
  const envBadge = document.getElementById("envBadge");

  const msg = document.getElementById("msg");
  const sendBtn = document.getElementById("sendBtn");
  const mainBtnToggle = document.getElementById("mainBtnToggle");
  const hapticBtn = document.getElementById("hapticBtn");
  const expandBtn = document.getElementById("expandBtn");
  const closeBtn = document.getElementById("closeBtn");
  const themeBtn = document.getElementById("themeBtn");

  function applyTelegramTheme() {
    if (!tg) return;
    const p = tg.themeParams || {};
    // Use Telegram theme colors if available, fallback to CSS defaults
    document.documentElement.style.setProperty("--bg", p.bg_color || "#0b0b0c");
    document.documentElement.style.setProperty("--card", p.secondary_bg_color || "#141416");
    document.documentElement.style.setProperty("--text", p.text_color || "#f2f2f2");
    document.documentElement.style.setProperty("--muted", p.hint_color || "#a7a7a7");
    document.documentElement.style.setProperty("--btn", p.button_color || "#2ea6ff");
    document.documentElement.style.setProperty("--btnText", p.button_text_color || "#081018");
  }

  function init() {
    if (!tg) {
      envBadge.textContent = "Not in Telegram";
      elName.textContent = "Open this inside Telegram";
      return;
    }

    tg.ready();
    tg.expand(); // nice UX

    applyTelegramTheme();

    const u = tg.initDataUnsafe?.user;
    elName.textContent = u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : "—";
    elUid.textContent = u?.id ? String(u.id) : "—";
    elTheme.textContent = tg.colorScheme || "—";
    envBadge.textContent = "Telegram WebApp";

    // MainButton (bottom CTA inside Telegram)
    tg.MainButton.setText("Send via Main Button");
    tg.MainButton.hide();

    tg.onEvent("themeChanged", () => {
      applyTelegramTheme();
      elTheme.textContent = tg.colorScheme || "—";
    });

    tg.MainButton.onClick(() => {
      sendPayload("main_button");
    });

    sendBtn.addEventListener("click", () => sendPayload("send_button"));

    mainBtnToggle.addEventListener("click", () => {
      if (tg.MainButton.isVisible) tg.MainButton.hide();
      else tg.MainButton.show();
    });

    hapticBtn.addEventListener("click", () => {
      tg.HapticFeedback?.impactOccurred("medium");
    });

    expandBtn.addEventListener("click", () => tg.expand());
    closeBtn.addEventListener("click", () => tg.close());
    themeBtn.addEventListener("click", () => {
      applyTelegramTheme();
      elTheme.textContent = tg.colorScheme || "—";
    });
  }

  function sendPayload(source) {
    if (!tg) return;

    const u = tg.initDataUnsafe?.user || {};
    const text = (msg.value || "").trim() || "Hello from Mini App!";

    const payload = {
      source,
      text,
      user: {
        id: u.id || null,
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        username: u.username || null
      },
      colorScheme: tg.colorScheme || null,
      platform: tg.platform || null,
      ts: new Date().toISOString()
    };

    // Send to bot
    tg.sendData(JSON.stringify(payload));

    tg.HapticFeedback?.notificationOccurred("success");
  }

  init();
})();
