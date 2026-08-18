/* Meadowmark site — command palette on Ctrl+Shift+F.
 * Lists every page, every settings control (rendered live, inline) and
 * every destination on the site. Selecting a result teleports: opens
 * the page/tab, scrolls the element into view, focuses it, and briefly
 * highlights it. Size (bounded card vs. full window) is a persisted
 * user choice, defaulting to the bounded card. */
(function (global) {
  "use strict";

  const LS_SIZE = "mm-palette-size";
  let index = [];
  let selectedIdx = 0;

  function buildIndex(rootPrefix) {
    index = [];
    (window.MMTabs ? MMTabs.allTabs() : []).forEach((item) => {
      index.push({
        kind: "page",
        title: item.en, titleYue: item.yue,
        path: item.href,
        href: item.href === "/" ? rootPrefix + "index.html" : rootPrefix + item.href.replace(/^\//, ""),
      });
    });
    // Settings controls, so a setting can be found and changed without leaving the palette.
    [
      { id: "set-theme", title: "Settings — Theme", titleYue: "設定 — 主題", anchor: "theme" },
      { id: "set-lang", title: "Settings — Language", titleYue: "設定 — 語言", anchor: "language" },
      { id: "set-funny-en", title: "Settings — English funny level", titleYue: "設定 — 英文抵死程度", anchor: "language" },
      { id: "set-funny-yue", title: "Settings — Cantonese funny level", titleYue: "設定 — 廣東話抵死程度", anchor: "language" },
      { id: "set-dock", title: "Settings — Tab strip edge", titleYue: "設定 — Tab strip 位置", anchor: "tabs" },
      { id: "set-accent", title: "Settings — Accent colour", titleYue: "設定 — 主色", anchor: "appearance" },
      { id: "set-font", title: "Settings — Font", titleYue: "設定 — 字體", anchor: "appearance" },
      { id: "set-reset", title: "Settings — Reset everything", titleYue: "設定 — 全部重設", anchor: "appearance" },
      { id: "cap-status", title: "Local tools — Release and browser status", titleYue: "本機工具 — 版本同瀏覽器狀態", href: "capabilities.html#cap-status" },
      { id: "cap-vocabulary", title: "Local tools — Personal vocabulary JSON", titleYue: "本機工具 — 個人詞彙 JSON", href: "capabilities.html#cap-identity" },
      { id: "cap-schedule", title: "Local tools — Scheduled appearance", titleYue: "本機工具 — 排程外觀", href: "capabilities.html#cap-identity" },
      { id: "cap-logo", title: "Local tools — Logo customization", titleYue: "本機工具 — 標誌自訂", href: "capabilities.html#cap-identity" },
      { id: "cap-converter", title: "Local tools — File converter", titleYue: "本機工具 — 檔案轉換器", href: "capabilities.html#cap-tools" },
      { id: "cap-ollama", title: "Local tools — Ollama browser boundary", titleYue: "本機工具 — Ollama 瀏覽器限制", href: "capabilities.html#cap-tools" },
      { id: "cap-locks", title: "Local tools — Toy locks and Support Tickets", titleYue: "本機工具 — 玩具鎖同本機支援票", href: "capabilities.html#cap-safety" },
      { id: "cap-auth", title: "Local tools — TOTP authenticator", titleYue: "本機工具 — TOTP 驗證器", href: "capabilities.html#cap-safety" },
      { id: "cap-history", title: "Local tools — History, exports, and notifications", titleYue: "本機工具 — 歷史、匯出同通知", href: "capabilities.html#cap-workspace" },
    ].forEach((s) => index.push({ kind: "setting", title: s.title, titleYue: s.titleYue, path: s.href ? "Local tools" : "Settings", href: rootPrefix + (s.href || ("settings.html#" + s.anchor)) }));
    document.querySelectorAll("[data-command-label]").forEach((node, position) => {
      index.push({ kind: "element", title: node.dataset.commandLabel, titleYue: "", path: document.title, href: location.pathname + location.hash, target: node, position });
    });
  }

  function score(item, q) {
    const hay = (item.title + " " + (item.titleYue || "")).toLowerCase();
    return hay.includes(q) ? 1 : 0;
  }

  function open(rootPrefix) {
    buildIndex(rootPrefix || "");
    const size = localStorage.getItem(LS_SIZE) || "card";
    const returnFocusTo = document.activeElement;

    function build() {
      const scrim = document.createElement("div");
      scrim.className = "mm-palette-scrim";
      const el = document.createElement("div");
      el.className = "mm-palette" + (size === "full" ? " full" : "");
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", "Command palette");
      el.tabIndex = -1;
      scrim.appendChild(el);
      document.body.appendChild(scrim);

      function close() {
        scrim.remove();
        document.removeEventListener("keydown", onKey, true);
        if (returnFocusTo && typeof returnFocusTo.focus === "function") returnFocusTo.focus();
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(); }
      }
      document.addEventListener("keydown", onKey, true);
      scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });

      const inputWrap = document.createElement("div");
      inputWrap.className = "mm-palette-input";
      const input = document.createElement("input");
      input.type = "text";
      input.setAttribute("data-str", "palette.placeholder");
      input.placeholder = window.MMStrings ? MMStrings.get("palette.placeholder", MMI18n.get().lang, MMI18n.get().funnyEn) : "Search…";
      inputWrap.appendChild(input);
      el.appendChild(inputWrap);
      const paletteMatcher = window.MMRegexBuilder ? MMRegexBuilder.attach(input, {}) : null;

      const results = document.createElement("div");
      results.className = "mm-palette-results";
      el.appendChild(results);

      const footer = document.createElement("div");
      footer.className = "mm-palette-footer";
      const sizeBtn = document.createElement("button");
      sizeBtn.className = "mm-btn tonal";
      sizeBtn.textContent = size === "full" ? "Bounded card" : "Full window";
      sizeBtn.addEventListener("click", () => {
        localStorage.setItem(LS_SIZE, size === "full" ? "card" : "full");
        close();
        open(rootPrefix);
      });
      const hintEl = document.createElement("span");
      hintEl.textContent = "↑↓ navigate · Enter select · Esc close";
      footer.appendChild(hintEl);
      footer.appendChild(sizeBtn);
      el.appendChild(footer);

      function draw() {
        const q = input.value.trim().toLowerCase();
        const matches = paletteMatcher ? index.filter((i) => paletteMatcher.matches(i.title + " " + (i.titleYue || "") + " " + i.path)) : (q ? index.filter((i) => score(i, q)) : index);
        results.innerHTML = "";
        selectedIdx = Math.min(selectedIdx, Math.max(0, matches.length - 1));
        if (!matches.length) {
          const empty = document.createElement("div");
          empty.className = "hint";
          empty.setAttribute("data-str", "palette.empty");
          results.appendChild(empty);
          return;
        }
        matches.forEach((m, i) => {
          const row = document.createElement("div");
          row.className = "mm-palette-item";
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", String(i === selectedIdx));
          const titleEl = document.createElement("div");
          titleEl.textContent = m.title;
          const pathEl = document.createElement("div");
          pathEl.className = "path";
          pathEl.textContent = m.path;
          row.appendChild(titleEl);
          row.appendChild(pathEl);
          row.addEventListener("click", () => select(m));
          results.appendChild(row);
        });
      }

      function select(m) {
        close();
        if (m.target && document.contains(m.target)) {
          m.target.scrollIntoView({ behavior: "smooth", block: "center" });
          m.target.classList.add("mm-highlight-flash");
          if (!m.target.matches('a,button,input,select,textarea,[tabindex]')) m.target.tabIndex = -1;
          m.target.focus();
          setTimeout(() => m.target.classList.remove("mm-highlight-flash"), 1500);
          return;
        }
        const [path, anchor] = m.href.split("#");
        const targetIsHere = window.location.pathname.endsWith(path.replace(/^\.*\//, "/"));
        if (anchor && targetIsHere) {
          const target = document.getElementById(anchor) || document.querySelector('[data-anchor="' + anchor + '"]');
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("mm-highlight-flash");
            target.setAttribute("tabindex", "-1");
            target.focus();
            setTimeout(() => target.classList.remove("mm-highlight-flash"), 1500);
            return;
          }
        }
        window.location.href = m.href;
      }

      input.addEventListener("input", draw);
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); selectedIdx++; draw(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); draw(); }
        else if (e.key === "Enter") {
          const q = input.value.trim().toLowerCase();
          const matches = paletteMatcher ? index.filter((i) => paletteMatcher.matches(i.title + " " + (i.titleYue || "") + " " + i.path)) : (q ? index.filter((i) => score(i, q)) : index);
          if (matches[selectedIdx]) select(matches[selectedIdx]);
        }
      });
      draw();
      input.focus();
    }
    build();
  }

  function installShortcut(rootPrefix) {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        open(rootPrefix);
      }
    });
  }

  global.MMPalette = { open, installShortcut };
})(window);
