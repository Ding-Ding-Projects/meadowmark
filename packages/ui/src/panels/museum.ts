/** Artifact exhibits: donation slots per set, completion rewards. */

import { h } from "../dom";
import { t } from "../i18n";
import { MuseumView } from "../contracts";

export function renderMuseumPanel(host: HTMLElement, view: MuseumView): () => void {
  const exhibitsEl = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } });
  for (const exhibit of view.exhibits) {
    exhibitsEl.appendChild(
      h(
        "div.mm-card.mm-card--outlined",
        { style: { padding: "12px" } },
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between" } },
          h("strong", {}, t(exhibit.setNameKey)),
          exhibit.completed ? h("span", {}, t("panel.museum.completed")) : null
        ),
        h(
          "div",
          { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          ...exhibit.slots.map((slot) =>
            h(
              "div.mm-cargo-slot",
              {},
              slot.def ? h("span", {}, t(slot.def.nameKey)) : h("span", {}, t("panel.museum.emptySlot"))
            )
          )
        ),
        h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.museum.reward", { coins: exhibit.rewardCoins }))
      )
    );
  }

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.museum.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.museum.title"))),
    exhibitsEl
  );
  host.appendChild(panel);
  return () => panel.remove();
}
