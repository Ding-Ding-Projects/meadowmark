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
          label: t("panel.town.deselect"),
          variant: "text",
          onClick: () => bridge.dispatch({ type: "town/select", instanceId: null }),
        }),
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

  // The 3D canvas has no click-to-select path yet (see renderer-bridge.ts's
  // header GAP notes: RendererHandle exposes no raycast/highlight hook this
  // package can drive), so this list is the only reachable way to select a
  // placed building and therefore the only reachable way to demolish one.
  const placedList =
    view.placed.length > 0
      ? list(
          ...view.placed.map((placed) =>
            listItem({
              titleText: placed.buildingId,
              subtitleText: `${t("panel.town.select")} (${placed.x}, ${placed.y})`,
              selected: placed.id === view.selectedBuildingInstanceId,
              onClick: () => bridge.dispatch({ type: "town/select", instanceId: placed.id }),
              ariaLabel: `${placed.buildingId} (${placed.x}, ${placed.y})`,
            })
          )
        )
      : h("div", {}, t("panel.town.placedEmpty"));

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.town.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.town.title"))),
    infoPanel,
    catalogueList,
    h("h3", { style: { margin: "16px 0 8px" } }, t("panel.town.placedTitle")),
    placedList
  );
  host.appendChild(panel);
  return () => panel.remove();
}
