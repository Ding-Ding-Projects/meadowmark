/** Enclosures, animal cards, and the hatchery. */

import { h, formatDuration, preserveFocusedDescendant } from "../dom";
import { button } from "../components/button";
import { openMenu } from "../components/menu";
import { spawnFloatingText } from "../effects/feedback";
import { t } from "../i18n";
import { HostBridge, ZooView } from "../contracts";

export function renderZooPanel(host: HTMLElement, view: ZooView, bridge: HostBridge): () => void {
  const grid = h("div.mm-grid", { role: "list", "aria-label": t("panel.zoo.gridLabel") });
  let tickHandle: number;

  function render(): void {
    preserveFocusedDescendant(grid, () => {
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
              if (view.availableAnimals.length === 0) {
                openMenu({
                  anchor: tile,
                  items: [{ id: "none", label: t("panel.zoo.noHatchedSpecies"), disabled: true }],
                });
                return;
              }
              openMenu({
                anchor: tile,
                items: view.availableAnimals.map((a) => ({
                  id: a.id,
                  label: t(a.nameKey),
                  onSelect: () => bridge.dispatch({ type: "zoo/assign", enclosureId: enclosure.id, animalId: a.id }),
                })),
              });
            } else if (ready) {
              spawnFloatingText(tile, "+1", "good", t("panel.zoo.collectAnnounce", { animal: t(animal.nameKey) }));
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
    });
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const collectionEl = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
  for (const card of view.speciesCards) {
    const canHatch = !card.hatched && card.cardsHeld >= card.cardsNeeded;
    collectionEl.appendChild(
      h(
        "div.mm-card.mm-card--outlined",
        { style: { padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { "aria-hidden": "true" }, card.iconId),
          h("span", {}, t(card.nameKey)),
          h(
            "span",
            { style: { fontSize: "var(--mm-type-body-small-size)", opacity: "0.75" } },
            t("panel.zoo.cardsProgress", { held: card.cardsHeld, needed: card.cardsNeeded })
          )
        ),
        card.hatched
          ? h("span", {}, t("panel.zoo.hatched"))
          : button({
              label: t("panel.zoo.hatch"),
              variant: "tonal",
              disabled: !canHatch,
              disabledReason: t("panel.zoo.needMoreCards"),
              onClick: () => bridge.dispatch({ type: "zoo/hatch", speciesId: card.speciesId }),
            })
      )
    );
  }

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.zoo.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.zoo.title"))),
    grid,
    h("h3", {}, t("panel.zoo.collectionTitle")),
    collectionEl
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
