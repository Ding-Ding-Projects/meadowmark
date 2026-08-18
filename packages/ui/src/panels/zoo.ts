/** Enclosures and animal cards. */

import { h, formatDuration } from "../dom";
import { button } from "../components/button";
import { openMenu } from "../components/menu";
import { t } from "../i18n";
import { HostBridge, ZooView } from "../contracts";

export function renderZooPanel(host: HTMLElement, view: ZooView, bridge: HostBridge): () => void {
  const grid = h("div.mm-grid", { role: "list", "aria-label": t("panel.zoo.gridLabel") });
  let tickHandle: number;

  function render(): void {
    grid.textContent = "";
    for (const enclosure of view.enclosures) {
      const animal = view.availableAnimals.find((a) => a.id === enclosure.animalId);
      const ready = enclosure.readyAt !== null && enclosure.readyAt <= Date.now();
      const tile = h(
        "button.mm-grid-tile",
        {
          class: `mm-grid-tile ${ready ? "mm-grid-tile--ready" : ""}`.trim(),
          type: "button",
          "aria-label": animal ? t(animal.nameKey) : t("panel.zoo.emptyEnclosure"),
          onclick: () => {
            if (!animal) {
              openMenu({
                anchor: tile,
                items: view.availableAnimals.map((a) => ({
                  id: a.id,
                  label: t(a.nameKey),
                  onSelect: () => bridge.dispatch({ type: "zoo/assign", enclosureId: enclosure.id, animalId: a.id }),
                })),
              });
            } else if (ready) {
              bridge.dispatch({ type: "zoo/collect", enclosureId: enclosure.id });
            }
          },
        },
        h("span.mm-grid-tile__icon", { "aria-hidden": "true" }, animal?.iconId ?? "➕")
      );
      if (animal && enclosure.readyAt && !ready) {
        tile.appendChild(h("span.mm-grid-tile__timer", {}, formatDuration(enclosure.readyAt - Date.now())));
      }
      grid.appendChild(tile);
    }
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.zoo.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.zoo.title"))),
    grid
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
