/**
 * The train delivery surface: all three wagons, individually visible and
 * individually fillable — each with its own requested goods, its own
 * load/dispatch/collect actions, and its own return-trip material reward
 * once it has actually departed and rolled one.
 */

import { h, formatDuration } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { HostBridge, TrainView, TrainWagonView } from "../contracts";

function wagonStatusKey(wagon: TrainWagonView): string {
  switch (wagon.state) {
    case "loading":
      return "panel.train.statusLoading";
    case "departed":
      return "panel.train.statusDeparted";
    case "arrived":
      return "panel.train.statusArrived";
  }
}

export function renderTrainPanel(host: HTMLElement, view: TrainView, bridge: HostBridge): () => void {
  const wagonsHost = h("div.mm-vehicle-list", { role: "list", "aria-label": t("panel.train.wagonListLabel") });
  let tickHandle: number;

  function renderWagon(wagon: TrainWagonView): HTMLElement {
    const fullyLoaded = wagon.requests.length > 0 && wagon.requests.every((r) => r.quantityLoaded >= r.quantityNeeded);

    const requestRows = wagon.requests.map((req) => {
      const room = Math.max(0, req.quantityNeeded - req.quantityLoaded);
      const loadable = Math.min(room, req.available);
      return h(
        "div",
        { class: `mm-order-req-row ${req.available < room ? "mm-order-req-row--missing" : ""}`.trim() },
        h("span", {}, `${req.goodId} ${req.quantityLoaded}/${req.quantityNeeded}`),
        wagon.state === "loading" && room > 0
          ? button({
              label: t("panel.train.load", { amount: loadable }),
              variant: "tonal",
              disabled: loadable <= 0,
              disabledReason: loadable <= 0 ? t("panel.train.notEnoughInBarn") : undefined,
              onClick: () => bridge.dispatch({ type: "train/load", wagonIndex: wagon.index, goodId: req.goodId, amount: loadable }),
            })
          : null
      );
    });

    const rewardText = wagon.rewardMaterials.length
      ? t("panel.train.rewardMaterials", { materials: wagon.rewardMaterials.map((m) => `${m.goodId} x${m.amount}`).join(", ") })
      : null;

    const timerText =
      (wagon.state === "departed" || wagon.state === "arrived") && wagon.returnsAt !== null
        ? formatDuration(wagon.returnsAt - Date.now())
        : "";

    const actions: (HTMLElement | null)[] = [];
    if (wagon.state === "loading") {
      actions.push(
        button({
          label: t("panel.train.dispatch"),
          variant: "filled",
          disabled: !fullyLoaded,
          disabledReason: fullyLoaded ? undefined : t("panel.train.notFullyLoaded"),
          onClick: () => bridge.dispatch({ type: "train/dispatch", wagonIndex: wagon.index }),
        })
      );
    }
    if (wagon.state === "arrived") {
      actions.push(
        button({
          label: t("panel.train.collect"),
          variant: "filled",
          onClick: () => bridge.dispatch({ type: "train/collect", wagonIndex: wagon.index }),
        })
      );
    }

    return h(
      "div.mm-card.mm-card--elevated.mm-vehicle-card",
      { role: "listitem", "aria-label": t("panel.train.wagonLabel", { index: wagon.index + 1 }) },
      h("strong", {}, t("panel.train.wagonLabel", { index: wagon.index + 1 })),
      h("div", { style: { fontSize: "var(--mm-type-body-small-size)" } }, t(wagonStatusKey(wagon))),
      ...requestRows,
      timerText ? h("div", { style: { fontSize: "var(--mm-type-label-small-size)" } }, timerText) : null,
      rewardText ? h("div", { style: { fontSize: "var(--mm-type-label-small-size)" } }, rewardText) : null,
      h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, ...actions)
    );
  }

  function render(): void {
    wagonsHost.textContent = "";
    for (const wagon of view.wagons) {
      wagonsHost.appendChild(renderWagon(wagon));
    }
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.train.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.train.title"))),
    wagonsHost
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
