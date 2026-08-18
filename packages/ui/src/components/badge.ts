import { h } from "../dom";

export function badge(count: number, ariaLabel: string): HTMLSpanElement | null {
  if (count <= 0) return null;
  return h("span.mm-badge", { "aria-label": ariaLabel }, count > 99 ? "99+" : String(count));
}
