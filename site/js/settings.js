/* Meadowmark site — the Settings page: itself tabbed, with its own
 * search wired to the regex builder. Every control shows progressive
 * disclosure of what it does plus a truthful provenance line (set by
 * you vs. the built-in default, naming the actual default value). */
(function (global) {
  "use strict";

  function explainRow(container, opts) {
    const row = document.createElement("div");
    row.className = "mm-setting-row";
    row.dataset.settingId = opts.id;
    row.dataset.searchText = (opts.title + " " + opts.explainEn).toLowerCase();

    const meta = document.createElement("div");
    meta.className = "mm-setting-meta";
    const h = document.createElement("div");
    h.style.fontWeight = "600";
    h.innerHTML = '<span class="i18n-en">' + opts.title + '</span><span class="i18n-yue" lang="yue">' + opts.titleYue + '</span>';
    meta.appendChild(h);

    const details = document.createElement("details");
    details.className = "mm-details";
    details.style.border = "none";
    details.style.padding = "0";
    details.style.background = "none";
    const summary = document.createElement("summary");
    summary.className = "mm-explain";
    summary.textContent = "What does this do? / 呢個係做乜㗎？";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "hint";
    body.style.marginTop = "4px";
    body.innerHTML = '<span class="i18n-en">' + opts.explainEn + '</span><span class="i18n-yue" lang="yue">' + opts.explainYue + '</span>';
    details.appendChild(body);
    meta.appendChild(details);

    const prov = document.createElement("div");
    prov.className = "mm-setting-provenance";
    prov.dataset.provenanceFor = opts.id;
    meta.appendChild(prov);

    row.appendChild(meta);
    const control = document.createElement("div");
    control.className = "control";
    row.appendChild(control);
    container.appendChild(row);
    return control;
  }

  function updateProvenance(id, isSet, valueLabel) {
    const el = document.querySelector('[data-provenance-for="' + id + '"]');
    if (!el) return;
    const lang = window.MMI18n ? MMI18n.get().lang : "en";
    const level = lang === "yue" ? MMI18n.get().funnyYue : MMI18n.get().funnyEn;
    if (isSet) {
      el.textContent = MMStrings.get("settings.provenance_set", lang, level);
    } else {
      el.textContent = MMStrings.get("settings.provenance_default", lang, level) + valueLabel;
    }
  }

  function switchControl(checked, onChange) {
    const btn = document.createElement("button");
    btn.className = "mm-switch";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", String(checked));
    const knob = document.createElement("span");
    knob.className = "knob";
    btn.appendChild(knob);
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("aria-checked") !== "true";
      btn.setAttribute("aria-checked", String(next));
      onChange(next);
    });
    return btn;
  }

  function buildTabs(nav) {
    const tabs = document.createElement("div");
    tabs.className = "mm-settings-nav";
    tabs.setAttribute("role", "tablist");
    const panels = [];
    nav.forEach((n, i) => {
      const btn = document.createElement("button");
      btn.className = "mm-tab mm-touch-ok";
      btn.setAttribute("role", "tab");
      btn.id = "settings-tab-" + n.id;
      btn.setAttribute("aria-controls", "settings-panel-" + n.id);
      btn.setAttribute("aria-selected", String(i === 0));
      btn.innerHTML = '<span class="i18n-en">' + n.label + '</span><span class="i18n-yue" lang="yue">' + n.labelYue + '</span>';
      btn.addEventListener("click", () => select(n.id));
      tabs.appendChild(btn);
    });
    function select(id) {
      tabs.querySelectorAll(".mm-tab").forEach((b) => b.setAttribute("aria-selected", String(b.id === "settings-tab-" + id)));
      panels.forEach((p) => { p.hidden = p.dataset.panel !== id; });
      history.replaceState(null, "", "#" + id);
    }
    return { tabs, select, registerPanel: (id, el) => { el.dataset.panel = id; panels.push(el); } };
  }

  function init(container, opts) {
    opts = opts || {};
    const shell = document.createElement("div");
    shell.className = "mm-settings-shell";

    const searchWrap = document.createElement("div");
    searchWrap.className = "mm-search";
    searchWrap.style.marginBottom = "16px";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search settings… / 搜尋設定…";
    search.setAttribute("aria-label", "Search settings");
    searchWrap.appendChild(search);

    const wrap = document.createElement("div");

    const navDefs = [
      { id: "language", label: "Language", labelYue: "語言" },
      { id: "theme", label: "Theme & density", labelYue: "主題同密度" },
      { id: "appearance", label: "Appearance", labelYue: "外觀" },
      { id: "tabs", label: "Tabs", labelYue: "分頁" },
    ];
    const { tabs, select, registerPanel } = buildTabs(navDefs);
    shell.appendChild(tabs);
    const panelHost = document.createElement("div");
    panelHost.className = "mm-settings-panel";
    shell.appendChild(panelHost);

    // --- Language panel ---
    const langPanel = document.createElement("div");
    langPanel.hidden = false;
    langPanel.id = "language";
    registerPanel("language", langPanel);

    const langCtl = explainRow(langPanel, {
      id: "lang-mode", title: "Language mode", titleYue: "語言模式",
      explainEn: "Switches every page between English, playful Hong Kong-style Cantonese, and a bilingual mode that shows both.",
      explainYue: "喺英文、抵死廣東話同雙語模式之間切換成個網站。",
    });
    const langSelect = document.createElement("select");
    [["en", "English"], ["yue", "廣東話"], ["bi", "Bilingual / 雙語"]].forEach(([v, t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t; langSelect.appendChild(o);
    });
    langSelect.value = MMI18n.get().lang;
    langSelect.addEventListener("change", () => { MMI18n.set({ lang: langSelect.value }); refreshProvenance(); });
    langCtl.appendChild(langSelect);

    const funnyEnCtl = explainRow(langPanel, {
      id: "funny-en", title: "English funny level", titleYue: "英文抵死程度",
      explainEn: "1 is fully serious, 5 is maximum playfulness. Only applies to interface copy — facts (versions, states, warnings) never change.",
      explainYue: "1 係最正經，5 係最百厭。淨係影響介面文字——事實（版本、狀態、警告）永遠唔會變。",
    });
    const funnyEnRange = document.createElement("input");
    funnyEnRange.type = "range"; funnyEnRange.min = 1; funnyEnRange.max = 5; funnyEnRange.className = "mm-range";
    funnyEnRange.value = MMI18n.get().funnyEn;
    funnyEnRange.setAttribute("aria-label", "English funny level, 1 to 5");
    funnyEnRange.addEventListener("input", () => { MMI18n.set({ funnyEn: parseInt(funnyEnRange.value, 10) }); refreshProvenance(); });
    funnyEnCtl.appendChild(funnyEnRange);

    const funnyYueCtl = explainRow(langPanel, {
      id: "funny-yue", title: "Cantonese funny level", titleYue: "廣東話抵死程度",
      explainEn: "Same idea, independent of the English slider, for the Cantonese voice.",
      explainYue: "同上，但同英文個掣分開，控制廣東話嘅語氣。",
    });
    const funnyYueRange = document.createElement("input");
    funnyYueRange.type = "range"; funnyYueRange.min = 1; funnyYueRange.max = 5; funnyYueRange.className = "mm-range";
    funnyYueRange.value = MMI18n.get().funnyYue;
    funnyYueRange.setAttribute("aria-label", "Cantonese funny level, 1 to 5");
    funnyYueRange.addEventListener("input", () => { MMI18n.set({ funnyYue: parseInt(funnyYueRange.value, 10) }); refreshProvenance(); });
    funnyYueCtl.appendChild(funnyYueRange);

    // --- Theme panel ---
    const themePanel = document.createElement("div");
    themePanel.hidden = true;
    registerPanel("theme", themePanel);
    const themeCtl = explainRow(themePanel, {
      id: "theme", title: "Theme", titleYue: "主題",
      explainEn: "System follows your OS/browser preference; Light and Dark override it explicitly.",
      explainYue: "「系統」跟返你部機嘅光暗設定；「淺色」同「深色」會強制指定。",
    });
    const themeSelect = document.createElement("select");
    [["system", "System"], ["light", "Light"], ["dark", "Dark"]].forEach(([v, t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t; themeSelect.appendChild(o);
    });
    themeSelect.value = MMTheme.get().theme;
    themeSelect.addEventListener("change", () => { MMTheme.set({ theme: themeSelect.value }); refreshProvenance(); });
    themeCtl.appendChild(themeSelect);

    const densityCtl = explainRow(themePanel, {
      id: "density", title: "Density", titleYue: "密度",
      explainEn: "Adjusts spacing across every control on the site.",
      explainYue: "調整成個網站所有控制項嘅間距。",
    });
    const densitySelect = document.createElement("select");
    [["compact", "Compact"], ["default", "Default"], ["comfortable", "Comfortable"]].forEach(([v, t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t; densitySelect.appendChild(o);
    });
    densitySelect.value = MMTheme.get().density;
    densitySelect.addEventListener("change", () => { MMTheme.set({ density: densitySelect.value }); refreshProvenance(); });
    densityCtl.appendChild(densitySelect);

    const fontScaleCtl = explainRow(themePanel, {
      id: "font-scale", title: "Font size scale", titleYue: "字體大小比例",
      explainEn: "Scales all text on the site from 85% to 140%.",
      explainYue: "調整成個網站文字大小，由 85% 到 140%。",
    });
    const fontScaleRange = document.createElement("input");
    fontScaleRange.type = "range"; fontScaleRange.min = 0.85; fontScaleRange.max = 1.4; fontScaleRange.step = 0.05; fontScaleRange.className = "mm-range";
    fontScaleRange.value = MMTheme.get().fontScale;
    fontScaleRange.addEventListener("input", () => { MMTheme.set({ fontScale: parseFloat(fontScaleRange.value) }); refreshProvenance(); });
    fontScaleCtl.appendChild(fontScaleRange);

    // --- Appearance panel ---
    const appearancePanel = document.createElement("div");
    appearancePanel.hidden = true;
    registerPanel("appearance", appearancePanel);
    const accentCtl = explainRow(appearancePanel, {
      id: "accent", title: "Accent colour", titleYue: "主色",
      explainEn: "Overrides the primary colour used across buttons and highlights, via the infinite colour picker.",
      explainYue: "透過無限色彩選擇器，改變按鈕同重點顏色嘅主色。",
    });
    const accentHost = document.createElement("div");
    accentCtl.appendChild(accentHost);
    const currentAccent = MMTheme.get().accent;
    const initRgb = currentAccent ? MMColor.parseHex(currentAccent) || { r: 58, g: 107, b: 63, a: 1 } : { r: 58, g: 107, b: 63, a: 1 };
    MMColor.build(accentHost, initRgb, (rgba) => {
      MMTheme.set({ accent: MMColor.toHex(rgba.r, rgba.g, rgba.b) });
      refreshProvenance();
    });

    const fontCtl = explainRow(appearancePanel, {
      id: "font-family", title: "Interface font", titleYue: "介面字體",
      explainEn: "Overrides the system font stack used across the whole site.",
      explainYue: "改變成個網站用嘅系統字體。",
    });
    const fontSelect = document.createElement("select");
    [["", "(system default)"], ["Georgia, serif", "Georgia"], ["'Courier New', monospace", "Courier New"], ["Verdana, sans-serif", "Verdana"]].forEach(([v, t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t; fontSelect.appendChild(o);
    });
    fontSelect.value = MMTheme.get().fontFamily || "";
    fontSelect.addEventListener("change", () => { MMTheme.set({ fontFamily: fontSelect.value || null }); refreshProvenance(); });
    fontCtl.appendChild(fontSelect);

    const resetRow = document.createElement("div");
    resetRow.className = "mm-setting-row";
    const resetBtn = document.createElement("button");
    resetBtn.className = "mm-btn secondary";
    resetBtn.textContent = "Reset everything to defaults / 全部重設返預設值";
    resetBtn.id = "appearance";
    resetBtn.addEventListener("click", () => {
      MMTheme.reset();
      MMAppearanceEditor.resetAll();
      themeSelect.value = MMTheme.get().theme;
      densitySelect.value = MMTheme.get().density;
      fontScaleRange.value = MMTheme.get().fontScale;
      fontSelect.value = "";
      refreshProvenance();
      MMNotifications.toast("Appearance reset to the built-in defaults. / 外觀已重設返內建預設值。");
    });
    resetRow.appendChild(resetBtn);
    appearancePanel.appendChild(resetRow);

    // --- Tabs panel ---
    const tabsPanel = document.createElement("div");
    tabsPanel.hidden = true;
    registerPanel("tabs", tabsPanel);
    const dockCtl = explainRow(tabsPanel, {
      id: "tab-dock", title: "Tab strip edge", titleYue: "Tab strip 位置",
      explainEn: "Docks the site's tab strip to the left (default), right, top, or bottom of the window.",
      explainYue: "將網站嘅 tab strip 泊喺左（預設）、右、上或下。",
    });
    MMTabs.tabDockEdgePicker(dockCtl);
    document.addEventListener("mm:appearance-changed", () => MMTabs.tabDockEdgePicker(dockCtl));

    function refreshProvenance() {
      const th = MMTheme.get();
      updateProvenance("lang-mode", true, "");
      updateProvenance("funny-en", true, "");
      updateProvenance("funny-yue", true, "");
      updateProvenance("theme", th._source === "stored", MMTheme.DEFAULTS.theme);
      updateProvenance("density", th._source === "stored", MMTheme.DEFAULTS.density);
      updateProvenance("font-scale", th._source === "stored", String(MMTheme.DEFAULTS.fontScale));
      updateProvenance("accent", !!th.accent, "primary green (#3a6b3f / #a8d5a8 in dark mode)");
      updateProvenance("font-family", !!th.fontFamily, "system font stack");
    }
    refreshProvenance();

    panelHost.appendChild(langPanel);
    panelHost.appendChild(themePanel);
    panelHost.appendChild(appearancePanel);
    panelHost.appendChild(tabsPanel);

    wrap.appendChild(searchWrap);
    wrap.appendChild(shell);
    container.appendChild(wrap);

    if (window.MMRegexBuilder) MMRegexBuilder.attach(search, {});
    search.addEventListener("input", () => {
      const matcher = MMRegexBuilder.attach(search, {});
      document.querySelectorAll(".mm-setting-row").forEach((row) => {
        row.style.display = matcher.matches(row.dataset.searchText || "") ? "" : "none";
      });
    });

    const hash = (location.hash || "").replace("#", "");
    if (hash && navDefs.some((n) => n.id === hash)) select(hash);
  }

  global.MMSettings = { init };
})(window);
