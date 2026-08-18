/**
 * The helicopter delivery surface: two independent fast orders, a
 * reputation bar that fills as orders are fulfilled, and the reputation
 * chest it eventually unlocks.
 */

import { h, formatDuration, formatMoney } from "../dom";
import { button } from "../components/button";
import { progressLinear } from "../components/progress";
import { t } from "../i18n";
import { HelicopterOrderView, HelicopterView, HostBridge } from "../contracts";

export function renderHelicopterPanel(host: HTMLElement, view: HelicopterView, bridge: HostBridge): () => void {
  const ordersHost = h("div.mm-vehicle-list", { role: "list", "aria-label": t("panel.helicopter.orderListLabel") });
  const chestHost = h("div");
  let tickHandle: number;

  function renderOrder(order: HelicopterOrderView): HTMLElement {
    if (order.state === "refilling") {
      const remaining = order.refillAt !== null ? formatDuration(order.refillAt - Date.now()) : "";
      return h(
        "div.mm-card.mm-card--outlined.mm-vehicle-card",
        { role: "listitem", "aria-label": t("panel.helicopter.orderLabel", { index: order.index + 1 }) },
        h("strong", {}, t("panel.helicopter.orderLabel", { index: order.index + 1 })),
        h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.helicopter.refilling", { remaining }))
      );
    }

    const requirementRows = order.requirements.map((req) =>
      h(
        "div",
        { class: `mm-order-req-row ${req.available < req.amount ? "mm-order-req-row--missing" : ""}`.trim() },
        `${req.goodId} ${req.available}/${req.amount}`
      )
    );

    return h(
      "div.mm-card.mm-card--elevated.mm-vehicle-card",
      { role: "listitem", "aria-label": t("panel.helicopter.orderLabel", { index: order.index + 1 }) },
      h("strong", {}, t("panel.helicopter.orderLabel", { index: order.index + 1 })),
      ...requirementRows,
      h(
        "div",
        { style: { fontSize: "var(--mm-type-body-small-size)" } },
        t("panel.helicopter.reward", { coins: order.rewardCoins, stars: order.rewardReputationStars })
      ),
      button({
        label: t("panel.helicopter.fulfill"),
        variant: "filled",
        disabled: !order.canFulfill,
        disabledReason: order.canFulfill ? undefined : t("panel.helicopter.cannotFulfill"),
        onClick: () => bridge.dispatch({ type: "helicopter/fulfill", orderIndex: order.index }),
      })
    );
  }

  function renderChest(): HTMLElement {
    const reward = view.chestReward;
    return h(
      "div.mm-card.mm-card--elevated.mm-vehicle-chest",
      {},
      h("strong", {}, t("panel.helicopter.chestReady")),
      reward
        ? h(
            "div",
            { style: { fontSize: "var(--mm-type-body-small-size)" } },
            t("panel.helicopter.chestReward", {
              cash: formatMoney(reward.cash),
              booster: reward.boosterKind,
              boosterQty: reward.boosterQuantity,
              permits: reward.expansionPermits,
            })
          )
        : h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.helicopter.chestRewardUnknown")),
      button({
        label: t("panel.helicopter.openChest"),
        variant: "filled",
        onClick: () => bridge.dispatch({ type: "helicopter/openChest" }),
      })
    );
  }

  function render(): void {
    ordersHost.textContent = "";
    for (const order of view.orders) {
      ordersHost.appendChild(renderOrder(order));
    }

    chestHost.textContent = "";
    if (view.chestReady) {
      chestHost.appendChild(renderChest());
    }
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const reputationLabel = t("panel.helicopter.reputationLabel", { bar: view.reputationBar, cap: view.reputationBarCap });
  const reputationFraction = view.reputationBarCap > 0 ? view.reputationBar / view.reputationBarCap : 0;

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.helicopter.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.helicopter.title"))),
    h(
      "div",
      {},
      h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, reputationLabel),
      progressLinear(reputationFraction, reputationLabel)
    ),
    chestHost,
    ordersHost
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
