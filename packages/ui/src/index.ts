/**
 * Public entry point for @meadowmark/ui. The Electron host (packages/app)
 * imports `mountUi` and calls it once, passing a live GameStateView store
 * plus concrete RendererBridge/HostBridge implementations.
 *
 * This module owns the entire DOM layer over the three.js canvas: the HUD,
 * every panel, settings, notifications, the destructive-action gate, the
 * command palette, and the regex-powered search system. It never imports
 * `three` or `electron` — see contracts.ts for the narrow interfaces this
 * package reads/calls instead, reconciled with the real shared/engine types
 * at integration time.
 */

import "./tokens.css";
import "./components/components.css";
import "./hud/hud.css";
import "./panels/panels.css";
import "./universal/universal.css";

import "./i18n/common";
import "./i18n/hud";
import "./i18n/panels";
import "./i18n/regex";
import "./i18n/notifications";
import "./i18n/palette";
import "./i18n/confirm";
import "./i18n/settings";
import "./i18n/content";
import "./i18n/history";

import { mountHud } from "./hud";
import { renderFieldsPanel } from "./panels/fields";
import { renderFactoriesPanel } from "./panels/factories";
import { renderBarnPanel } from "./panels/barn";
import { renderOrdersPanel } from "./panels/orders";
import { renderTrainPanel } from "./panels/train";
import { renderHelicopterPanel } from "./panels/helicopter";
import { renderShipPanel } from "./panels/ship";
import { renderTownPanel } from "./panels/town";
import { renderZooPanel } from "./panels/zoo";
import { renderMinePanel } from "./panels/mine";
import { renderMuseumPanel } from "./panels/museum";
import { renderAchievementsPanel } from "./panels/achievements";
import { renderDailiesPanel } from "./panels/dailies";
import { renderVillagePanel } from "./panels/village";
import { openOfflineSummaryDialog } from "./panels/offline-summary";
import { mountSettings } from "./settings";
import { tabs } from "./components/tabs";
import { installCommandPaletteHotkey, registerPaletteSource } from "./palette/command-palette";
import { settingsStore } from "./settings/store";
import { setTheme, setDensityScale } from "./tokens";
import { t } from "./i18n";
import { h } from "./dom";
import { mountUniversalCenter } from "./universal/center";

import { GameStateView, HostBridge, ReadonlyStore, RendererBridge } from "./contracts";

export * from "./contracts";
export * from "./dom";
export * from "./tokens";
export { t, tParts, setLanguageMode, setFunnyLevel, i18nStore } from "./i18n";
export * from "./components";
export { openOverlay, closeAllOverlays } from "./overlays";
export { notify, notifyInfo, notifySuccess, notifyWarning, notifyError } from "./notifications";
export { openSuperConfirm } from "./confirm/super-confirm";
export { attachContextMenu } from "./menus/context-menu";
export { openCommandPalette, registerPaletteSource } from "./palette/command-palette";
export { openRegexBuilder, searchField } from "./search/regex-builder";
export { hydrateSettingsFromHost } from "./settings/store";

export interface MountUiOptions {
  state$: ReadonlyStore<GameStateView>;
  renderer: RendererBridge;
  host: HostBridge;
}

export interface MountedUi {
  unmount(): void;
}

/** Mounts the entire Meadowmark DOM interface into `root`. */
export function mountUi(root: HTMLElement, opts: MountUiOptions): MountedUi {
  document.body.classList.add("mm-root");

  // Apply persisted appearance settings on boot.
  const s = settingsStore.getSnapshot();
  setTheme(s.theme);
  setDensityScale(s.density);
  document.documentElement.style.setProperty("--mm-seed-hue", String(s.accentSeedHue));

  const disposers: (() => void)[] = [];

  disposers.push(mountHud(root, opts.state$));

  const panelHost = h("div.mm-primary-panel-host", { id: "mm-primary-panel", role: "tabpanel", tabindex: "0" });
  root.appendChild(panelHost);
  disposers.push(() => panelHost.remove());

  let currentDisposer: (() => void) | null = null;
  function mountPanel(id: string): void {
    currentDisposer?.();
    currentDisposer = null;
    const state = opts.state$.getSnapshot();
    switch (id) {
      case "fields":
        currentDisposer = renderFieldsPanel(panelHost, state.fields, opts.host);
        break;
      case "factories":
        currentDisposer = renderFactoriesPanel(panelHost, state.factories, state.barn, opts.host);
        break;
      case "barn":
        currentDisposer = renderBarnPanel(panelHost, state.barn, opts.host);
        break;
      case "orders":
        currentDisposer = renderOrdersPanel(panelHost, state.orders, opts.host);
        break;
      case "train":
        currentDisposer = renderTrainPanel(panelHost, state.train, opts.host);
        break;
      case "helicopter":
        currentDisposer = renderHelicopterPanel(panelHost, state.helicopter, opts.host);
        break;
      case "ship":
        currentDisposer = renderShipPanel(panelHost, state.ship, opts.host);
        break;
      case "town":
        currentDisposer = renderTownPanel(panelHost, state.town, opts.host, opts.renderer);
        break;
      case "zoo":
        currentDisposer = renderZooPanel(panelHost, state.zoo, opts.host);
        break;
      case "mine":
        currentDisposer = renderMinePanel(panelHost, state.mine, opts.host);
        break;
      case "museum":
        currentDisposer = renderMuseumPanel(panelHost, state.museum, opts.host);
        break;
      case "achievements":
        currentDisposer = renderAchievementsPanel(panelHost, state.achievements, opts.host);
        break;
      case "dailies":
        currentDisposer = renderDailiesPanel(panelHost, state.dailies, opts.host);
        break;
      case "village":
        currentDisposer = renderVillagePanel(panelHost, state.village);
        break;
      case "settings":
        currentDisposer = mountSettings(panelHost);
        break;
      case "control-centre":
        currentDisposer = mountUniversalCenter(panelHost);
        break;
    }
  }

  const tabDefs = [
    { id: "fields", label: t("panel.fields.title") },
    { id: "factories", label: t("panel.factories.title") },
    { id: "barn", label: t("panel.barn.title") },
    { id: "orders", label: t("panel.orders.title") },
    { id: "train", label: t("panel.train.title") },
    { id: "helicopter", label: t("panel.helicopter.title") },
    { id: "ship", label: t("panel.ship.title") },
    { id: "town", label: t("panel.town.title") },
    { id: "zoo", label: t("panel.zoo.title") },
    { id: "mine", label: t("panel.mine.title") },
    { id: "museum", label: t("panel.museum.title") },
    { id: "achievements", label: t("panel.achievements.title") },
    { id: "dailies", label: t("panel.dailies.title") },
    { id: "village", label: t("panel.village.title") },
    { id: "settings", label: t("settings.title") },
    { id: "control-centre", label: "Control centre · 控制中心" },
  ];

  // Each nav "tab" mounts the corresponding panel into panelHost rather than
  // holding all panels simultaneously in the DOM — keeps the surface light.
  const navTabsHandle = tabs({
    ariaLabel: t("nav.regionLabel"),
    dock: s.tabDock,
    activeId: "fields",
    onActivate: mountPanel,
    tabs: tabDefs.map((d) => ({ id: d.id, label: d.label, controlsId: "mm-primary-panel" })),
  });
  const navHost = h("div.mm-primary-nav-host");
  navHost.appendChild(navTabsHandle.root);
  root.appendChild(navHost);
  disposers.push(() => navHost.remove());
  mountPanel("fields");

  const removeHotkey = installCommandPaletteHotkey();
  disposers.push(removeHotkey);

  registerPaletteSource(() =>
    tabDefs.map((d) => ({
      kind: "destination" as const,
      id: `nav-${d.id}`,
      label: d.label,
      teleport: () => navTabsHandle.setActive(d.id),
    }))
  );

  const offlineSub = opts.state$.subscribe((state) => {
    if (state.pendingOfflineSummary) {
      openOfflineSummaryDialog(state.pendingOfflineSummary, opts.host);
    }
  });
  disposers.push(offlineSub);
  if (opts.state$.getSnapshot().pendingOfflineSummary) {
    openOfflineSummaryDialog(opts.state$.getSnapshot().pendingOfflineSummary!, opts.host);
  }

  return {
    unmount(): void {
      currentDisposer?.();
      for (const dispose of disposers) dispose();
    },
  };
}
