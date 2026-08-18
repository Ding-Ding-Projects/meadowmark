/** Artifact exhibits: donation slots per set, completion rewards. */

import { h } from "../dom";
import { t } from "../i18n";
import { HostBridge, MuseumView } from "../contracts";

export function renderMuseumPanel(host: HTMLElement, view: MuseumView, bridge: HostBridge): () => void {
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
          ...exhibit.slots.map((slot) => {
            if (slot.artifactId && slot.def) {
              return h(
                "div.mm-cargo-slot",
                { title: t(slot.def.nameKey) },
                h("span", {}, t(slot.def.nameKey))
              );
            }
            if (slot.available && slot.def) {
              // The required artifact for this slot is fully assembled and
              // waiting to be handed over - a real, clickable donation, not
              // just a status readout.
              return h(
                "button.mm-cargo-slot.mm-cargo-slot--actionable",
                {
                  type: "button",
                  "aria-label": `${t(slot.def.nameKey)} — ${t("panel.museum.donateReady")}`,
                  title: t("panel.museum.donateReady"),
                  onclick: () =>
                    bridge.dispatch({
                      type: "museum/donate",
                      setId: exhibit.setId,
                      slotIndex: exhibit.slots.indexOf(slot),
                      artifactId: slot.def!.id,
                    }),
                },
                h("span", {}, t(slot.def.nameKey)),
                h("span", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.museum.donateReady"))
              );
            }
            return h(
              "div.mm-cargo-slot",
              { title: slot.def ? t("panel.museum.notReady") : undefined },
              slot.def ? h("span", {}, t(slot.def.nameKey)) : h("span", {}, t("panel.museum.emptySlot"))
            );
          })
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
