/**
 * Plot grid view: crop picker, plant / plant-all / harvest-all, and live
 * growth-timer countdowns.
 */

import { h, formatDuration, preserveFocusedDescendant } from "../dom";
import { button } from "../components/button";
import { select } from "../components/select";
import { t } from "../i18n";
import { FieldsView, HostBridge } from "../contracts";

const CROP_ICONS: Record<string, string> = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  strawberry: "🍓",
  tomato: "🍅",
  potato: "🥔",
  grape: "🍇",
  blueberry: "🫐",
  pumpkin: "🎃",
};

function plotIcon(plot: FieldsView["plots"][number], crops: FieldsView["availableCrops"]): string {
  // Narrow via a local binding rather than repeated `plot.state.kind` checks
  // — narrowing chained property accesses across statements is unreliable,
  // and this keeps the discriminated-union narrowing unambiguous.
  const state = plot.state;
  if (state.kind === "empty") return "▧";
  if (state.kind === "withered") return "🥀";
  const crop = crops.find((c) => c.id === state.cropId);
  return CROP_ICONS[state.cropId] ?? (crop ? "🌱" : "▧");
}

function cropLabel(cropId: string, crops: FieldsView["availableCrops"]): string {
  const crop = crops.find((c) => c.id === cropId);
  return crop ? t(crop.nameKey) : cropId;
}

function plotLabel(plot: FieldsView["plots"][number], crops: FieldsView["availableCrops"]): string {
  const state = plot.state;
  if (state.kind === "empty") return t("panel.fields.plotEmptyShort");
  if (state.kind === "withered") return t("panel.fields.plotWitheredShort");
  return cropLabel(state.cropId, crops);
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
    preserveFocusedDescendant(grid, () => {
    grid.textContent = "";
    for (const plot of view.plots) {
      const stateClass =
        plot.state.kind === "ready" ? "mm-grid-tile--ready" : "";
      const tile = h(
        "button.mm-grid-tile",
        {
          class: `mm-grid-tile ${stateClass}`.trim(),
          type: "button",
          "aria-label": plotAriaLabel(plot),
          onclick: () => onPlotClick(plot),
        },
        h("span.mm-grid-tile__icon", { "aria-hidden": "true" }, plotIcon(plot, view.availableCrops)),
        h("span.mm-grid-tile__label", {}, plotLabel(plot, view.availableCrops))
      );
      if (plot.state.kind === "growing") {
        tile.appendChild(h("span.mm-grid-tile__timer", {}, formatDuration(plot.state.readyAt - Date.now())));
      }
      grid.appendChild(tile);
    }
    });
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
