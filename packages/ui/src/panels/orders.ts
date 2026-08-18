/** The 6-slot order board: required goods, rewards, fill button, reroll. */

import { h, formatDuration, formatMoney, preserveFocusedDescendant } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { HostBridge, OrdersView } from "../contracts";

export function renderOrdersPanel(host: HTMLElement, view: OrdersView, bridge: HostBridge): () => void {
  const board = h("div.mm-order-board", { role: "list", "aria-label": t("panel.orders.boardLabel") });
  let tickHandle: number;

  function render(): void {
    preserveFocusedDescendant(board, () => {
    board.textContent = "";
    for (const slot of view.slots) {
      if (!slot.orderId) {
        board.appendChild(
          h("div.mm-card.mm-card--outlined.mm-order-slot", { role: "listitem" }, h("span", {}, t("panel.orders.emptySlot")))
        );
        continue;
      }
      const requirementRows = slot.requirements.map((req) =>
        h(
          "div",
          { class: `mm-order-req-row ${req.available < req.amount ? "mm-order-req-row--missing" : ""}`.trim() },
          `${req.goodId} ${req.available}/${req.amount}`
        )
      );
      const timerText = slot.expiresAt ? formatDuration(slot.expiresAt - Date.now()) : "";
      board.appendChild(
        h(
          "div.mm-card.mm-card--elevated.mm-order-slot",
          { role: "listitem" },
          ...requirementRows,
          h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t("panel.orders.reward", { coins: slot.rewardCoins, xp: slot.rewardXp, cash: formatMoney(slot.rewardCash) })),
          timerText ? h("div", { style: { fontSize: "var(--mm-type-label-small-size)" } }, timerText) : null,
          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            button({
              label: t("panel.orders.fill"),
              variant: "filled",
              disabled: !slot.canFill,
              disabledReason: slot.canFill ? undefined : t("panel.orders.cannotFill"),
              onClick: () => bridge.dispatch({ type: "order/fill", orderIndex: slot.index }),
            }),
            button({
              label: slot.rerollCost !== null ? t("panel.orders.reroll", { cost: formatMoney(slot.rerollCost) }) : t("panel.orders.rerollUnavailable"),
              variant: "outlined",
              disabled: slot.rerollCost === null,
              disabledReason: slot.rerollCost === null ? t("panel.orders.rerollUnavailableReason") : undefined,
              onClick: () => bridge.dispatch({ type: "order/reroll", orderIndex: slot.index }),
            })
          )
        )
      );
    }
    });
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.orders.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.orders.title"))),
    board
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
