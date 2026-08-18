/** The mine dig grid: energy cost, tools, and finds. */

import { h } from "../dom";
import { t } from "../i18n";
import { HostBridge, MineView } from "../contracts";

const TILE_ICON: Record<MineView["grid"][number]["state"], string> = {
  hidden: "⬛",
  revealed: "▫️",
  obstacle: "🪨",
  find: "💎",
};

export function renderMinePanel(host: HTMLElement, view: MineView, bridge: HostBridge): () => void {
  const grid = h("div.mm-grid", {
    role: "grid",
    "aria-label": t("panel.mine.gridLabel"),
    style: { gridTemplateColumns: `repeat(${view.gridWidth}, minmax(48px, 1fr))` },
  });

  for (const tile of view.grid) {
    grid.appendChild(
      h(
        "button.mm-grid-tile",
        {
          type: "button",
          "aria-label": t("panel.mine.tile", { state: tile.state }),
          disabled: tile.state !== "hidden" && tile.state !== "obstacle",
          onclick: () => bridge.dispatch({ type: "mine/dig", tileIndex: tile.index }),
        },
        h("span.mm-grid-tile__icon", { "aria-hidden": "true" }, TILE_ICON[tile.state])
      )
    );
  }

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.mine.title") },
    h(
      "div.mm-panel__header",
      {},
      h("h2.mm-panel__title", {}, t("panel.mine.title")),
      h("span", {}, t("panel.mine.energyCost", { cost: view.energyCostPerDig }))
    ),
    view.toolId ? h("div", {}, t("panel.mine.currentTool", { tool: view.toolId })) : null,
    grid
  );
  host.appendChild(panel);
  return () => panel.remove();
}
