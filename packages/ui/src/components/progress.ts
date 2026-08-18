import { h } from "../dom";
import { clamp } from "../dom";

export function progressLinear(fraction: number, ariaLabel: string): HTMLDivElement {
  const pct = Math.round(clamp(fraction, 0, 1) * 100);
  return h(
    "div.mm-progress-linear",
    { role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": ariaLabel },
    h("div.mm-progress-linear__bar", { style: { width: `${pct}%` } })
  );
}

export function progressCircular(sizePx = 24, ariaLabel = "Loading"): HTMLDivElement {
  const el = h("div.mm-progress-circular", { role: "progressbar", "aria-label": ariaLabel, "aria-valuetext": "indeterminate" });
  el.innerHTML = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" style="animation: mm-spin var(--mm-motion-duration-long4) linear infinite">
    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--mm-color-surface-container-highest)" stroke-width="3"/>
    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--mm-color-primary)" stroke-width="3" stroke-dasharray="42 100" stroke-linecap="round"/>
  </svg>`;
  return el;
}

if (typeof document !== "undefined" && !document.getElementById("mm-progress-keyframes")) {
  const style = document.createElement("style");
  style.id = "mm-progress-keyframes";
  style.textContent = `@keyframes mm-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .mm-progress-circular svg { animation: none !important; } }`;
  document.head.appendChild(style);
}
