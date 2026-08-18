/** The train delivery surface: cargo slots, timers, dispatch/collect actions. */

import { renderVehiclePanel } from "./vehicle-shared";
import { DeliveryVehicleView, HostBridge } from "../contracts";

export function renderTrainPanel(host: HTMLElement, view: DeliveryVehicleView, bridge: HostBridge): () => void {
  return renderVehiclePanel(host, view, bridge, "panel.train.title");
}
