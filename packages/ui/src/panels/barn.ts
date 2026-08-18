/** Stored goods with capacity bar, sell, and upgrade. */

import { h, clamp, formatMoney } from "../dom";
import { button } from "../components/button";
import { progressLinear } from "../components/progress";
import { list, listItem } from "../components/list";
import { t } from "../i18n";
import { BarnView, HostBridge } from "../contracts";

export function renderBarnPanel(host: HTMLElement, view: BarnView, bridge: HostBridge): () => void {
  const fraction = clamp(view.used / Math.max(1, view.capacity), 0, 1);

  const goodsList = list(
    ...Object.entries(view.stock)
      .filter(([, amount]) => amount > 0)
      .map(([goodId, amount]) => {
        const def = view.goodDefs[goodId];
        return listItem({
          titleText: def ? t(def.nameKey) : goodId,
          subtitleText: t("panel.barn.sellPrice", { price: formatMoney(def?.sellPrice ?? 0) }),
          trailing: button({
            label: t("panel.barn.sell", { amount }),
            variant: "tonal",
            onClick: () => bridge.dispatch({ type: "barn/sell", goodId, amount }),
          }),
          ariaLabel: `${def ? t(def.nameKey) : goodId}: ${amount}`,
        });
      })
  );

  const upgradeBtn = button({
    label: view.upgradeCost !== null ? t("panel.barn.upgrade", { cost: formatMoney(view.upgradeCost), cap: view.nextCapacity }) : t("panel.barn.maxCapacity"),
    variant: "filled",
    disabled: view.upgradeCost === null,
    disabledReason: view.upgradeCost === null ? t("panel.barn.maxCapacityReason") : undefined,
    onClick: () => bridge.dispatch({ type: "barn/upgrade" }),
  });

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.barn.title") },
    h(
      "div.mm-panel__header",
      {},
      h("h2.mm-panel__title", {}, t("panel.barn.title")),
      h("div.mm-panel__toolbar", {}, upgradeBtn)
    ),
    h(
      "div",
      {},
      h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "var(--mm-type-body-small-size)" } }, `${view.used} / ${view.capacity}`),
      progressLinear(fraction, t("panel.barn.capacityLabel", { used: view.used, cap: view.capacity }))
    ),
    Object.keys(view.stock).length ? goodsList : h("div", {}, t("common.state.empty"))
  );
  host.appendChild(panel);
  return () => panel.remove();
}
