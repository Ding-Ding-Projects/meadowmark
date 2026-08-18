/**
 * The settings surface: presented as tabs (never a scrolling column), with
 * its own search field wired to the shared regex builder. Covers theme,
 * density, accent/seed colour, UI font family/size/weight, language mode,
 * both funny sliders, the "show emojis in dialogs" toggle, and render
 * quality (a novice Speed 1-5 plus the advanced values it maps to).
 */

import { h } from "../dom";
import { tabs } from "../components/tabs";
import { select } from "../components/select";
import { button } from "../components/button";
import { slider, switchControl } from "../components/form-controls";
import { searchField } from "../search/regex-builder";
import { funnyLevelSliders } from "./funny-level";
import { renderHistoryPanel } from "../history";
import { renderExportsPanel } from "../exports";
import { renderLogoPanel } from "../logo";
import { AppSettings, classifyRenderQuality, renderQualityPreset, settingsStore, TabDock, ThemeMode } from "./store";
import { LanguageMode, setLanguageMode, i18nStore } from "../i18n";
import { t } from "../i18n";
import { setTheme, setDensityScale } from "../tokens";
import { resetOnboarding } from "../onboarding";
import { notifyInfo } from "../notifications";

interface SettingEntry {
  id: string;
  labelKey: string;
  tabId: string;
  matches(query: string): boolean;
}

function labelText(entry: SettingEntry): string {
  return t(entry.labelKey);
}

export function mountSettings(host: HTMLElement): () => void {
  const s = settingsStore.getSnapshot();

  // -- General tab --------------------------------------------------------
  const themeSelect = select({
    labelText: t("settings.general.themeLabel"),
    options: [
      { value: "system", label: t("settings.general.themeSystem") },
      { value: "light", label: t("settings.general.themeLight") },
      { value: "dark", label: t("settings.general.themeDark") },
    ],
    value: s.theme,
    onChange: (v) => {
      settingsStore.update((prev) => ({ ...prev, theme: v as ThemeMode }));
      setTheme(v as ThemeMode);
    },
  });

  const densitySlider = slider({
    min: 0.8,
    max: 1.3,
    step: 0.05,
    value: s.density,
    ariaLabel: t("settings.general.densityLabel"),
    formatValue: (v) => `${Math.round(v * 100)}%`,
    onInput: (v) => {
      settingsStore.update((prev) => ({ ...prev, density: v }));
      setDensityScale(v);
    },
  });

  const emojiToggle = switchControl({
    checked: s.showEmojisInDialogs,
    ariaLabel: t("settings.general.emojiToggleLabel"),
    onChange: (checked) => settingsStore.update((prev) => ({ ...prev, showEmojisInDialogs: checked })),
  });

  const dockSelect = select({
    labelText: t("settings.general.tabDockLabel"),
    options: [
      { value: "left", label: t("settings.general.dockLeft") },
      { value: "right", label: t("settings.general.dockRight") },
      { value: "top", label: t("settings.general.dockTop") },
      { value: "bottom", label: t("settings.general.dockBottom") },
    ],
    value: s.tabDock,
    onChange: (v) => settingsStore.update((prev) => ({ ...prev, tabDock: v as TabDock })),
  });

  const replayOnboardingBtn = button({
    label: t("settings.general.replayOnboarding"),
    variant: "outlined",
    onClick: () => {
      resetOnboarding();
      notifyInfo(t("settings.general.replayOnboarding.done"));
    },
  });

  const generalPanel = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    themeSelect,
    h("div", {}, h("label", {}, t("settings.general.densityLabel")), densitySlider),
    h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, emojiToggle, h("span", {}, t("settings.general.emojiToggleLabel"))),
    dockSelect,
    replayOnboardingBtn
  );

  // -- Appearance tab -------------------------------------------------------
  const accentSlider = slider({
    min: 0,
    max: 360,
    step: 1,
    value: s.accentSeedHue,
    ariaLabel: t("settings.appearance.accentLabel"),
    formatValue: (v) => `${v}°`,
    onInput: (v) => {
      settingsStore.update((prev) => ({ ...prev, accentSeedHue: v }));
      document.documentElement.style.setProperty("--mm-seed-hue", String(v));
    },
  });

  const fontFamilySelect = select({
    labelText: t("settings.appearance.fontFamilyLabel"),
    options: [
      { value: "system-ui", label: t("settings.appearance.fontSystem") },
      { value: '"Segoe UI"', label: "Segoe UI" },
      { value: '"Noto Sans"', label: "Noto Sans" },
      { value: '"Noto Sans HK"', label: "Noto Sans HK" },
    ],
    value: s.fontFamily,
    onChange: (v) => {
      settingsStore.update((prev) => ({ ...prev, fontFamily: v }));
      document.documentElement.style.setProperty("--mm-font-family", `${v}, "Segoe UI", "Noto Sans HK", system-ui, sans-serif`);
    },
  });

  const fontSizeSlider = slider({
    min: 0.85,
    max: 1.4,
    step: 0.05,
    value: s.fontSizeScale,
    ariaLabel: t("settings.appearance.fontSizeLabel"),
    formatValue: (v) => `${Math.round(v * 100)}%`,
    onInput: (v) => {
      settingsStore.update((prev) => ({ ...prev, fontSizeScale: v }));
      document.documentElement.style.fontSize = `${v * 16}px`;
    },
  });

  const fontWeightSlider = slider({
    min: 300,
    max: 700,
    step: 100,
    value: s.fontWeight,
    ariaLabel: t("settings.appearance.fontWeightLabel"),
    formatValue: (v) => String(v),
    onInput: (v) => settingsStore.update((prev) => ({ ...prev, fontWeight: v })),
  });

  const appearancePanel = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    h("div", {}, h("label", {}, t("settings.appearance.accentLabel")), accentSlider),
    fontFamilySelect,
    h("div", {}, h("label", {}, t("settings.appearance.fontSizeLabel")), fontSizeSlider),
    h("div", {}, h("label", {}, t("settings.appearance.fontWeightLabel")), fontWeightSlider)
  );

  // -- Language tab ---------------------------------------------------------
  const languageSelect = select({
    labelText: t("settings.language.modeLabel"),
    options: [
      { value: "en", label: t("settings.language.english") },
      { value: "yue", label: t("settings.language.cantonese") },
      { value: "bilingual", label: t("settings.language.bilingual") },
    ],
    value: i18nStore.getSnapshot().language,
    onChange: (v) => setLanguageMode(v as LanguageMode),
  });

  const languagePanel = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    languageSelect,
    funnyLevelSliders()
  );

  // -- Render quality tab -----------------------------------------------------
  const rq = settingsStore.getSnapshot().renderQuality;
  const speedValue = rq.speedLevel === "custom" ? classifyRenderQuality(rq) : rq.speedLevel;
  const speedLabel = h("span", {}, speedValue === "custom" ? t("settings.render.custom") : t("settings.render.speedValue", { level: speedValue }));

  const speedSlider = slider({
    min: 1,
    max: 5,
    step: 1,
    value: typeof speedValue === "number" ? speedValue : 3,
    ariaLabel: t("settings.render.speedLabel"),
    formatValue: (v) => t("settings.render.speedValue", { level: v }),
    onInput: (v) => {
      const preset = renderQualityPreset(v as 1 | 2 | 3 | 4 | 5);
      settingsStore.update((prev) => ({ ...prev, renderQuality: preset }));
      renderAdvancedFromStore();
    },
  });

  const advancedHost = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" } });

  function renderAdvancedFromStore(): void {
    const current = settingsStore.getSnapshot().renderQuality;
    advancedHost.textContent = "";
    advancedHost.appendChild(
      select({
        labelText: t("settings.render.shadowLabel"),
        options: ["off", "low", "medium", "high"].map((v) => ({ value: v, label: t(`settings.render.shadow.${v}`) })),
        value: current.shadowQuality,
        onChange: (v) => updateAdvanced({ shadowQuality: v as any }),
      })
    );
    advancedHost.appendChild(
      slider({
        min: 100,
        max: 1200,
        step: 50,
        value: current.drawDistance,
        ariaLabel: t("settings.render.drawDistanceLabel"),
        formatValue: (v) => `${v}m`,
        onInput: (v) => updateAdvanced({ drawDistance: v }),
      })
    );
    advancedHost.appendChild(
      slider({
        min: 0,
        max: 1,
        step: 0.05,
        value: current.particleDensity,
        ariaLabel: t("settings.render.particleLabel"),
        formatValue: (v) => `${Math.round(v * 100)}%`,
        onInput: (v) => updateAdvanced({ particleDensity: v }),
      })
    );
    const aaSwitch = switchControl({
      checked: current.antiAliasing,
      ariaLabel: t("settings.render.antiAliasLabel"),
      onChange: (checked) => updateAdvanced({ antiAliasing: checked }),
    });
    advancedHost.appendChild(h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, aaSwitch, h("span", {}, t("settings.render.antiAliasLabel"))));
  }

  function updateAdvanced(patch: Partial<Omit<AppSettings["renderQuality"], "speedLevel">>): void {
    settingsStore.update((prev) => {
      const merged = { ...prev.renderQuality, ...patch };
      const level = classifyRenderQuality(merged);
      speedLabel.textContent = level === "custom" ? t("settings.render.custom") : t("settings.render.speedValue", { level });
      return { ...prev, renderQuality: { ...merged, speedLevel: level } };
    });
  }

  renderAdvancedFromStore();

  const renderPanel = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", {}, h("label", {}, t("settings.render.speedLabel")), speedSlider, speedLabel),
    h(
      "p",
      { style: { fontSize: "var(--mm-type-body-small-size)", color: "var(--mm-color-on-surface-variant)" } },
      t("settings.render.explanation")
    ),
    advancedHost
  );

  // -- Assemble with search ---------------------------------------------------
  const entries: SettingEntry[] = [
    { id: "theme", labelKey: "settings.general.themeLabel", tabId: "general", matches: (q) => t("settings.general.themeLabel").toLowerCase().includes(q) },
    { id: "density", labelKey: "settings.general.densityLabel", tabId: "general", matches: (q) => t("settings.general.densityLabel").toLowerCase().includes(q) },
    { id: "replayOnboarding", labelKey: "settings.general.replayOnboarding", tabId: "general", matches: (q) => t("settings.general.replayOnboarding").toLowerCase().includes(q) },
    { id: "accent", labelKey: "settings.appearance.accentLabel", tabId: "appearance", matches: (q) => t("settings.appearance.accentLabel").toLowerCase().includes(q) },
    { id: "font", labelKey: "settings.appearance.fontFamilyLabel", tabId: "appearance", matches: (q) => t("settings.appearance.fontFamilyLabel").toLowerCase().includes(q) },
    { id: "language", labelKey: "settings.language.modeLabel", tabId: "language", matches: (q) => t("settings.language.modeLabel").toLowerCase().includes(q) },
    { id: "renderSpeed", labelKey: "settings.render.speedLabel", tabId: "render", matches: (q) => t("settings.render.speedLabel").toLowerCase().includes(q) },
  ];

  const searchResultsEl = h("div", { style: { display: "none", flexDirection: "column", gap: "4px", padding: "8px 0" } });

  const { el: searchEl } = searchField({
    ariaLabel: t("settings.searchLabel"),
    onChange: (state) => {
      const query = state.query.trim().toLowerCase();
      if (!query) {
        searchResultsEl.style.display = "none";
        return;
      }
      searchResultsEl.style.display = "flex";
      searchResultsEl.textContent = "";
      const matches = entries.filter((e) => e.matches(query));
      if (matches.length === 0) {
        searchResultsEl.appendChild(h("div", {}, t("common.state.noMatches")));
        return;
      }
      for (const entry of matches) {
        searchResultsEl.appendChild(
          h(
            "button.mm-list-item",
            { type: "button", onclick: () => tabsHandle.setActive(entry.tabId) },
            h("span", {}, `${labelText(entry)} — ${t(`settings.tab.${entry.tabId}`)}`)
          )
        );
      }
    },
  });

  const tabsHandle = tabs({
    ariaLabel: t("settings.tabsLabel"),
    dock: "top",
    activeId: "general",
    tabs: [
      { id: "general", label: t("settings.tab.general"), panel: generalPanel },
      { id: "appearance", label: t("settings.tab.appearance"), panel: appearancePanel },
      { id: "language", label: t("settings.tab.language"), panel: languagePanel },
      { id: "render", label: t("settings.tab.render"), panel: renderPanel },
      { id: "history", label: t("settings.tab.history"), panel: renderHistoryPanel() },
      { id: "exports", label: t("settings.tab.exports"), panel: renderExportsPanel() },
      { id: "logo", label: t("settings.tab.logo"), panel: renderLogoPanel() },
    ],
  });

  const root = h(
    "section.mm-panel",
    { "aria-label": t("settings.title") },
    h("h2.mm-panel__title", {}, t("settings.title")),
    searchEl,
    searchResultsEl,
    tabsHandle.root
  );
  host.appendChild(root);

  return () => root.remove();
}
