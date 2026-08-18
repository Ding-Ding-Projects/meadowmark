/**
 * The ship delivery surface: six crates across three goods on a rolling
 * 24-hour window, each paying its own coins/xp on collection, plus the
 * chest that opens once all six have been collected.
 */

import { h, formatDuration, formatMoney } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { HostBridge, ShipCrateView, ShipView } from "../contracts";

export function renderShipPanel(host: HTMLElement, view: ShipView, bridge: HostBridge): () => void {
  const windowHost = h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } });
  const chestHost = h("div");
  const cratesHost = h("div.mm-vehicle-list", { role: "list", "aria-label": t("panel.ship.crateListLabel") });
  let tickHandle: number;

  function renderCrate(crate: ShipCrateView): HTMLElement {
    const room = Math.max(0, crate.quantityNeeded - crate.quantityLoaded);
    const loadable = Math.min(room, crate.available);

    return h(
      "div.mm-card.mm-card--elevated.mm-vehicle-card",
      { role: "listitem", "aria-label": t("panel.ship.crateLabel", { index: crate.index + 1 }) },
      h("strong", {}, t("panel.ship.crateLabel", { index: crate.index + 1 })),
      h(
        "div",
        { class: `mm-order-req-row ${crate.available < room ? "mm-order-req-row--missing" : ""}`.trim() },
        `${crate.goodId} ${crate.quantityLoaded}/${crate.quantityNeeded}`
      ),
      h(
        "div",
        { style: { fontSize: "var(--mm-type-body-small-size)" } },
        t("panel.ship.crateReward", { coins: crate.rewardCoins, xp: crate.rewardXp })
      ),
      h(
        "div",
        { style: { display: "flex", gap: "8px" } },
        room > 0
          ? button({
              label: t("panel.ship.load", { amount: loadable }),
              variant: "tonal",
              disabled: loadable <= 0,
              disabledReason: loadable <= 0 ? t("panel.ship.notEnoughInBarn") : undefined,
              onClick: () => bridge.dispatch({ type: "ship/load", crateIndex: crate.index, goodId: crate.goodId, amount: loadable }),
            })
          : button({
              label: t("panel.ship.collect"),
              variant: "filled",
              disabled: !crate.canCollect,
              onClick: () => bridge.dispatch({ type: "ship/collect", crateIndex: crate.index }),
            })
      )
    );
  }

  function renderChest(): HTMLElement {
    const reward = view.chestReward;
    return h(
      "div.mm-card.mm-card--elevated.mm-vehicle-chest",
      {},
      h("strong", {}, t("panel.ship.chestReady")),
      reward
        ? h(
            "div",
            { style: { fontSize: "var(--mm-type-body-small-size)" } },
            t("panel.ship.chestReward", { cash: formatMoney(reward.cash), permits: reward.expansionPermits })
          )
        : h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.ship.chestRewardUnknown")),
      button({
        label: t("panel.ship.openChest"),
        variant: "filled",
        onClick: () => bridge.dispatch({ type: "ship/openChest" }),
      })
    );
  }

  function render(): void {
    if (!view.unlocked) {
      windowHost.textContent = t("panel.ship.locked");
    } else if (view.windowEndsAt !== null) {
      windowHost.textContent = t("panel.ship.windowRemaining", { remaining: formatDuration(view.windowEndsAt - Date.now()) });
    } else {
      windowHost.textContent = t("panel.ship.windowUnknown");
    }

    cratesHost.textContent = "";
    for (const crate of view.crates) {
      cratesHost.appendChild(renderCrate(crate));
    }

    chestHost.textContent = "";
    if (view.chestReady) {
      chestHost.appendChild(renderChest());
    }
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.ship.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.ship.title"))),
    windowHost,
    chestHost,
    view.unlocked
      ? cratesHost
      : h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.ship.lockedDetail"))
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
