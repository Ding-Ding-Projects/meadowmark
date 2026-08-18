/** Building catalogue, placement mode entry, building info, and demolish. */

import { h, formatMoney } from "../dom";
import { button } from "../components/button";
import { list, listItem } from "../components/list";
import { openSuperConfirm } from "../confirm/super-confirm";
import { t } from "../i18n";
import { HostBridge, RendererBridge, TownView } from "../contracts";

export function renderTownPanel(host: HTMLElement, view: TownView, bridge: HostBridge, renderer: RendererBridge): () => void {
  const catalogueList = list(
    ...view.catalog.map((entry) =>
      listItem({
        titleText: t(entry.nameKey),
        subtitleText: t("panel.town.cost", { coins: entry.cost.coins, cash: formatMoney(entry.cost.cash) }),
        trailing: button({
          label: t("panel.town.place"),
          variant: "tonal",
          onClick: () => {
            renderer.enterPlacementMode(
              entry.id,
              (x, y, rotation) => bridge.dispatch({ type: "town/place", buildingId: entry.id, x, y, rotation }),
              () => {}
            );
          },
        }),
        ariaLabel: t(entry.nameKey),
      })
    )
  );

  const selectedBuilding = view.placed.find((p) => p.id === view.selectedBuildingInstanceId);
  const infoPanel = selectedBuilding
    ? h(
        "div.mm-card.mm-card--outlined",
        { style: { padding: "12px" } },
        h("strong", {}, selectedBuilding.buildingId),
        button({
          label: t("panel.town.demolish"),
          variant: "danger",
          onClick: () =>
            openSuperConfirm({
              actionTitleKey: "panel.town.demolishTitle",
              actionTitleVars: { building: selectedBuilding.buildingId },
              detailKey: "panel.town.demolishDetail",
              detailVars: { building: selectedBuilding.buildingId },
              onConfirmed: () => bridge.dispatch({ type: "town/demolish", instanceId: selectedBuilding.id }),
            }),
        })
      )
    : h("div", {}, t("panel.town.noSelection"));

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.town.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.town.title"))),
    infoPanel,
    catalogueList
  );
  host.appendChild(panel);
  return () => panel.remove();
}
