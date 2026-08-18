/**
 * The village board. Entirely local: this is a self-contained list of
 * generated "neighbours" with no network identity, no server, and no other
 * real player anywhere. The notice below is deliberately unmissable — this
 * is a project-wide contract, not a suggestion.
 */

import { h } from "../dom";
import { list, listItem } from "../components/list";
import { t } from "../i18n";
import { VillageView } from "../contracts";

export function renderVillagePanel(host: HTMLElement, view: VillageView): () => void {
  const notice = h(
    "div.mm-village-notice",
    { role: "note" },
    h("span", { "aria-hidden": "true" }, "🔒"),
    h("span", {}, t("panel.village.localOnlyNotice"))
  );

  const neighborsList = list(
    ...view.neighbors.map((n) =>
      listItem({
        titleText: n.displayName,
        subtitleText: t("panel.village.level", { level: n.level }),
        ariaLabel: n.displayName,
      })
    )
  );

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.village.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.village.title"))),
    notice,
    view.neighbors.length ? neighborsList : h("div", {}, t("common.state.empty"))
  );
  host.appendChild(panel);
  return () => panel.remove();
}
