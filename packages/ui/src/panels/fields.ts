/**
 * Plot grid view: crop picker, plant / plant-all / harvest-all, and live
 * growth-timer countdowns.
 */

import { h, formatDuration } from "../dom";
import { button } from "../components/button";
import { select } from "../components/select";
import { t } from "../i18n";
import { FieldsView, HostBridge } from "../contracts";

/**
 * `CropDef.iconId` (see ../contracts.ts and state-to-ui.ts's mapFields) is
 * an *asset name* like "crop_wheat" — the identifier the 3D engine's mesh
 * registry uses, not a displayable glyph. Rendering it directly as this
 * tile's text used to leak the raw asset id ("crop_wheat") onto the
 * screen for every growing/ready plot. There is no real icon art for the
 * 2D panel yet, so this maps the handful of crops with an obvious emoji
 * match and falls back to a generic plant glyph for the rest — a labelled
 * placeholder rather than a broken one. The plot's accessible name (see
 * plotAriaLabel below) always names the real crop regardless of which
 * glyph got picked.
 */
const CROP_EMOJI: Partial<Record<string, string>> = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  sugarcane: "🎋",
  strawberry: "🍓",
  tomato: "🍅",
  potato: "🥔",
  rice: "🌾",
  pumpkin: "🎃",
  chilli: "🌶️",
  coffee_bean: "☕",
  lavender: "💜",
  grape: "🍇",
  blueberry: "🫐",
};

/**
 * An "empty" plot has no icon at all - it renders as an honest dashed-
 * outline tile (see .mm-grid-tile--empty in panels.css) plus this "+" so
 * it reads as "plantable" rather than as a mystery placeholder. This used
 * to return the "▫️" emoji, which Windows' emoji font renders as a small
 * lavender-tinted square at the 28px size .mm-grid-tile__icon uses - it
 * looked exactly like an undesigned filler glyph because that's
 * essentially what it was.
 */
function plotIcon(plot: FieldsView["plots"][number], crops: FieldsView["availableCrops"]): string {
  // Narrow via a local binding rather than repeated `plot.state.kind` checks
  // — narrowing chained property accesses across statements is unreliable,
  // and this keeps the discriminated-union narrowing unambiguous.
  const state = plot.state;
  if (state.kind === "empty") return "+";
  if (state.kind === "withered") return "🥀";
  const crop = crops.find((c) => c.id === state.cropId);
  if (!crop) return "🌱";
  return CROP_EMOJI[crop.id] ?? "🌱";
}

export function renderFieldsPanel(host: HTMLElement, view: FieldsView, bridge: HostBridge): () => void {
  let selectedCropId = view.availableCrops[0]?.id ?? "";
  let tickHandle: number;

  const cropOptions = view.availableCrops.map((c) => ({ value: c.id, label: t(c.nameKey) }));

  const cropSelect = select({
    labelText: t("panel.fields.cropPickerLabel"),
    options: cropOptions,
    value: selectedCropId,
    onChange: (v) => {
      selectedCropId = v;
    },
  });

  const plantAllBtn = button({
    label: t("panel.fields.plantAll"),
    variant: "tonal",
    onClick: () => bridge.dispatch({ type: "field/plantAll", cropId: selectedCropId }),
  });

  const harvestAllBtn = button({
    label: t("panel.fields.harvestAll"),
    variant: "filled",
    onClick: () => bridge.dispatch({ type: "field/harvestAll" }),
  });

  const grid = h("div.mm-grid", { role: "grid", "aria-label": t("panel.fields.gridLabel") });

  function renderGrid(): void {
    grid.textContent = "";
    for (const plot of view.plots) {
      const stateClass =
        plot.state.kind === "ready"
          ? "mm-grid-tile--ready"
          : plot.state.kind === "empty"
            ? "mm-grid-tile--empty"
            : "";
      const tile = h(
        "button.mm-grid-tile",
        {
          class: `mm-grid-tile ${stateClass}`.trim(),
          type: "button",
          "aria-label": plotAriaLabel(plot),
          onclick: () => onPlotClick(plot),
        },
        h("span.mm-grid-tile__icon", { "aria-hidden": "true" }, plotIcon(plot, view.availableCrops))
      );
      if (plot.state.kind === "growing") {
        tile.appendChild(h("span.mm-grid-tile__timer", {}, formatDuration(plot.state.readyAt - Date.now())));
      }
      grid.appendChild(tile);
    }
  }

  function plotAriaLabel(plot: FieldsView["plots"][number]): string {
    const state = plot.state;
    if (state.kind === "empty") return t("panel.fields.plotEmpty", { index: plot.index });
    if (state.kind === "ready") {
      return t("panel.fields.plotReady", { index: plot.index });
    }
    if (state.kind === "withered") return t("panel.fields.plotWithered", { index: plot.index });
    return t("panel.fields.plotGrowing", { index: plot.index, remaining: formatDuration(state.readyAt - Date.now()) });
  }

  function onPlotClick(plot: FieldsView["plots"][number]): void {
    if (plot.state.kind === "empty" || plot.state.kind === "withered") {
      bridge.dispatch({ type: "field/plant", plotId: plot.id, cropId: selectedCropId });
    } else if (plot.state.kind === "ready") {
      bridge.dispatch({ type: "field/harvest", plotId: plot.id });
    }
  }

  renderGrid();
  tickHandle = window.setInterval(renderGrid, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.fields.title") },
    h(
      "div.mm-panel__header",
      {},
      h("h2.mm-panel__title", {}, t("panel.fields.title")),
      h("div.mm-panel__toolbar", {}, plantAllBtn, harvestAllBtn)
    ),
    cropSelect,
    grid
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
