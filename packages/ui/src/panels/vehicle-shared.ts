/**
 * Shared rendering logic for the three delivery vehicle surfaces (train,
 * helicopter, ship). Each panel file (train.ts / helicopter.ts / ship.ts) is
 * a thin, explicitly-named wrapper around this so each is independently
 * documented and independently reachable from the palette/tabs, per the
 * project's "every surface is real, not aliased" spirit — while the actual
 * rendering logic is not tripled.
 */

import { h, formatDuration } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { DeliveryVehicleView, HostBridge } from "../contracts";

export function renderVehiclePanel(
  host: HTMLElement,
  view: DeliveryVehicleView,
  bridge: HostBridge,
  titleKey: string
): () => void {
  const cargoRow = h("div.mm-cargo-row", { role: "list", "aria-label": t("panel.vehicle.cargoLabel") });
  let tickHandle: number;

  function render(): void {
    cargoRow.textContent = "";
    for (const slot of view.cargo) {
      cargoRow.appendChild(
        h(
          "div.mm-cargo-slot",
          { role: "listitem" },
          h("span", {}, slot.goodId ? `${slot.goodId} x${slot.amount}` : t("panel.vehicle.emptyCargoSlot")),
          slot.requestedGoodId
            ? h("span", { style: { fontSize: "var(--mm-type-label-small-size)" } }, t("panel.vehicle.requested", { good: slot.requestedGoodId, amount: slot.requestedAmount }))
            : null
        )
      );
    }

    statusEl.textContent = statusText();
    statusEl.className = view.state === "arrived" ? "mm-vehicle-status mm-vehicle-status--arrived" : "mm-vehicle-status";
    actionsEl.textContent = "";
    if (view.state === "idle" || view.state === "loading") {
      actionsEl.appendChild(
        button({
          label: t("panel.vehicle.dispatch"),
          variant: "filled",
          onClick: () => bridge.dispatch({ type: "vehicle/dispatch", vehicle: view.kind }),
        })
      );
    }
    if (view.state === "arrived") {
      const collectBtn = button({
        label: t("panel.vehicle.collect"),
        variant: "filled",
        onClick: () => bridge.dispatch({ type: "vehicle/collect", vehicle: view.kind }),
      });
      collectBtn.classList.add("mm-vehicle-collect--ready");
      actionsEl.appendChild(collectBtn);
    }
  }

  function statusText(): string {
    switch (view.state) {
      case "idle":
        return t("panel.vehicle.statusIdle");
      case "loading":
        return t("panel.vehicle.statusLoading");
      case "departed":
        return t("panel.vehicle.statusDeparted", { remaining: view.returnsAt ? formatDuration(view.returnsAt - Date.now()) : "" });
      case "returning":
        return t("panel.vehicle.statusReturning", { remaining: view.returnsAt ? formatDuration(view.returnsAt - Date.now()) : "" });
      case "arrived":
        return t("panel.vehicle.statusArrived");
    }
  }

  const statusEl = h("div", { role: "status" });
  const actionsEl = h("div", { style: { display: "flex", gap: "8px" } });

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t(titleKey) },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t(titleKey))),
    cargoRow,
    statusEl,
    actionsEl
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
