import { h } from "../dom";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger" | "icon";

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  onClick?: (ev: MouseEvent) => void;
  disabled?: boolean;
  disabledReason?: string;
  iconHtml?: string;
  ariaLabel?: string;
}

/** Builds an M3 button. When disabled, `disabledReason` is required and surfaced
 * as both a title tooltip and an aria-description so the reason is never hidden. */
export function button(opts: ButtonOptions): HTMLButtonElement {
  const variant = opts.variant ?? "filled";
  const btn = h("button.mm-btn", {
    class: `mm-btn mm-btn--${variant}`,
    type: "button",
    disabled: !!opts.disabled,
    "aria-label": opts.ariaLabel ?? (variant === "icon" ? opts.label : undefined),
    title: opts.disabled && opts.disabledReason ? opts.disabledReason : undefined,
    onclick: opts.onClick,
  });
  if (opts.iconHtml) {
    const icon = h("span.mm-btn__icon", { "aria-hidden": "true" });
    icon.innerHTML = opts.iconHtml;
    btn.appendChild(icon);
  }
  if (variant !== "icon") {
    btn.appendChild(document.createTextNode(opts.label));
  }
  if (opts.disabled && opts.disabledReason) {
    const desc = h("span.mm-visually-hidden", {}, opts.disabledReason);
    btn.appendChild(desc);
  }
  return btn;
}
