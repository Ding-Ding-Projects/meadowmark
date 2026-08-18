import { Child, h } from "../dom";

export type CardVariant = "filled" | "outlined" | "elevated";

export function card(variant: CardVariant = "filled", ...children: Child[]): HTMLDivElement {
  return h("div", { class: `mm-card mm-card--${variant}` }, ...children);
}
