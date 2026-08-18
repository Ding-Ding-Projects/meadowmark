/**
 * App-logo customization panel: shipped presets plus a local custom PNG
 * upload, following the fail-closed contract the manager documents (see
 * packages/app/src/services/logo/manager.ts) — applying a selection either
 * fully replaces the active logo or leaves the previous one completely
 * unchanged; there is no partial/broken intermediate state to render.
 *
 * Mounted as its own "Logo" tab inside the settings surface (see
 * ../settings/index.ts), following the same wiring pattern the History and
 * Export tabs already use: a bridge module talks to window.meadowmark,
 * this module only renders what the bridge reports.
 */

import { h } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import {
  applyLogoPreset,
  getLogoManifest,
  hasLogoBridge,
  listLogoPresets,
  LogoManifest,
  LogoPresetSummary,
  pickAndApplyCustomLogo,
  previewCurrentLogo,
  previewLogoPreset,
  resetLogoToDefault,
} from "./bridge";

function describeSelection(manifest: LogoManifest | null): string {
  if (!manifest) return t("logo.currentDefault");
  if (manifest.selection.type === "custom") return t("logo.currentCustom");
  return t("logo.currentPreset", { presetId: manifest.selection.presetId });
}

export function renderLogoPanel(): HTMLElement {
  if (!hasLogoBridge()) {
    return h(
      "div.mm-logo",
      { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("p", { role: "status" }, t("logo.unavailable"))
    );
  }

  const statusEl = h("p.mm-logo__status", { role: "status" }, t("logo.loading"));
  const currentPreviewEl = h("img.mm-logo__current-preview", {
    alt: t("logo.currentPreviewAlt"),
    style: { width: "64px", height: "64px", objectFit: "contain", background: "var(--mm-color-surface-variant)", borderRadius: "8px" },
  }) as HTMLImageElement;
  const currentLabelEl = h("span", {}, "");
  const presetsGridEl = h("div.mm-logo__presets", {
    style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "12px" },
  });

  async function refresh(): Promise<void> {
    statusEl.textContent = t("logo.loading");
    const [manifest, dataUrl, presets] = await Promise.all([
      getLogoManifest(),
      previewCurrentLogo(),
      listLogoPresets(),
    ]);
    currentPreviewEl.src = dataUrl ?? "";
    currentLabelEl.textContent = describeSelection(manifest);
    statusEl.textContent = "";
    renderPresets(presets);
  }

  function renderPresets(presets: readonly LogoPresetSummary[]): void {
    presetsGridEl.textContent = "";
    for (const preset of presets) {
      const img = h("img", {
        alt: preset.label,
        style: { width: "64px", height: "64px", objectFit: "contain", display: "block", margin: "0 auto" },
      }) as HTMLImageElement;
      void previewLogoPreset(preset.id).then((dataUrl) => {
        if (dataUrl) img.src = dataUrl;
      });
      const presetButton = button({
        label: preset.label,
        variant: "outlined",
        onClick: () => void applyPreset(preset.id),
      });
      presetsGridEl.appendChild(
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", textAlign: "center" } },
          img,
          presetButton
        )
      );
    }
  }

  async function applyPreset(presetId: string): Promise<void> {
    statusEl.textContent = t("logo.applying");
    try {
      await applyLogoPreset(presetId);
      await refresh();
    } catch (err) {
      statusEl.textContent = t("logo.applyFailed", { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const uploadButton = button({
    label: t("logo.uploadAction"),
    variant: "filled",
    onClick: () => void uploadCustom(),
  });

  async function uploadCustom(): Promise<void> {
    statusEl.textContent = t("logo.waitingForFile");
    try {
      const result = await pickAndApplyCustomLogo();
      if (!result) {
        statusEl.textContent = t("logo.unavailable");
      } else if ("canceled" in result) {
        statusEl.textContent = t("logo.canceled");
      } else {
        await refresh();
      }
    } catch (err) {
      statusEl.textContent = t("logo.applyFailed", { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const resetButton = button({
    label: t("logo.resetAction"),
    variant: "text",
    onClick: () => void resetLogo(),
  });

  async function resetLogo(): Promise<void> {
    statusEl.textContent = t("logo.resetting");
    await resetLogoToDefault();
    await refresh();
  }

  void refresh();

  return h(
    "div.mm-logo",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    h("p", {}, t("logo.explanation")),
    h(
      "div",
      { style: { display: "flex", gap: "12px", alignItems: "center" } },
      currentPreviewEl,
      currentLabelEl,
      resetButton
    ),
    statusEl,
    h("h3", {}, t("logo.presetsHeading")),
    presetsGridEl,
    h("h3", {}, t("logo.customHeading")),
    h("p", {}, t("logo.customExplanation")),
    uploadButton
  );
}
