/** The returning-player dialog: exactly what happened while away. */

import { h, formatDuration } from "../dom";
import { openDialog } from "../components/dialog";
import { button } from "../components/button";
import { t } from "../i18n";
import { HostBridge, OfflineSummaryView } from "../contracts";

export function openOfflineSummaryDialog(summary: OfflineSummaryView, bridge: HostBridge): void {
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
}
