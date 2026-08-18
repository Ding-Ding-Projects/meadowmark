/** The returning-player dialog: exactly what happened while away. */

import { h, formatDuration } from "../dom";
import { openDialog } from "../components/dialog";
import { button } from "../components/button";
import { t } from "../i18n";
import { HostBridge, OfflineSummaryView } from "../contracts";

export interface OfflineSummaryDialogHandle {
  close: () => void;
}

/**
 * Opens the returning-player summary and hands back a handle so the caller can
 * tell whether one is already on screen. The caller MUST hold that handle: the
 * pending summary stays truthy in the view until the player acknowledges it, and
 * the tick loop pushes a new state every second, so an unguarded caller opens a
 * fresh dialog per tick. Measured before this returned anything: 68 stacked
 * dialogs in under 90 seconds, with the player racing the tick loop to close them.
 */
export function openOfflineSummaryDialog(summary: OfflineSummaryView, bridge: HostBridge): OfflineSummaryDialogHandle {
  const rows: HTMLElement[] = [
    h("div", {}, t("panel.offlineSummary.away", { duration: formatDuration(summary.awayDurationMs) })),
    h("div", {}, t("panel.offlineSummary.cropsHarvested", { count: summary.cropsHarvested })),
    h("div", {}, t("panel.offlineSummary.coinsEarned", { count: summary.coinsEarned })),
    h("div", {}, t("panel.offlineSummary.xpEarned", { count: summary.xpEarned })),
  ];
  if (summary.goodsProduced.length) {
    rows.push(
      h(
        "ul",
        {},
        ...summary.goodsProduced.map((g) => h("li", {}, t("panel.offlineSummary.goodProduced", { good: g.goodId, amount: g.amount })))
      )
    );
  }
  if (summary.ordersExpired > 0) {
    rows.push(h("div", { style: { color: "var(--mm-color-error)" } }, t("panel.offlineSummary.ordersExpired", { count: summary.ordersExpired })));
  }
  if (summary.vehiclesArrived > 0) {
    rows.push(h("div", {}, t("panel.offlineSummary.vehiclesArrived", { count: summary.vehiclesArrived })));
  }

  let handle: { close: () => void };
  const okBtn = button({
    label: t("common.action.close"),
    variant: "filled",
    onClick: () => {
      bridge.dispatch({ type: "offlineSummary/acknowledge" });
      handle.close();
    },
  });

  handle = openDialog({
    titleKey: "panel.offlineSummary.title",
    body: rows,
    actions: [okBtn],
    onClose: () => bridge.dispatch({ type: "offlineSummary/acknowledge" }),
  });
  return handle;
}
