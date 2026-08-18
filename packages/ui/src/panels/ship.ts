/** The ship delivery surface: cargo slots, timers, dispatch/collect actions. */

import { renderVehiclePanel } from "./vehicle-shared";
import { DeliveryVehicleView, HostBridge } from "../contracts";

export function renderShipPanel(host: HTMLElement, view: DeliveryVehicleView, bridge: HostBridge): () => void {
  return renderVehiclePanel(host, view, bridge, "panel.ship.title");
}
