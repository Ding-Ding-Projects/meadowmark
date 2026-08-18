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
let nextButtonDescId = 0;

export function button(opts: ButtonOptions): HTMLButtonElement {
  const variant = opts.variant ?? "filled";
  const hasReason = !!(opts.disabled && opts.disabledReason);
  // When an aria-label is present (every "icon" variant, and any caller that
  // supplies one explicitly), it REPLACES the button's accessible name from
  // its content per the accname spec -- a visually-hidden child span holding
  // the disabled reason would silently vanish from the accessibility tree.
  // aria-describedby is unaffected by aria-label, so it is the one route
  // that reliably surfaces the reason regardless of variant.
  const descId = hasReason ? `mm-btn-desc-${nextButtonDescId++}` : undefined;
  const btn = h("button.mm-btn", {
    class: `mm-btn mm-btn--${variant}`,
    type: "button",
    disabled: !!opts.disabled,
    "aria-label": opts.ariaLabel ?? (variant === "icon" ? opts.label : undefined),
    "aria-describedby": descId,
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
  if (hasReason && descId) {
    const desc = h("span.mm-visually-hidden", { id: descId }, opts.disabledReason as string);
    btn.appendChild(desc);
  }
  return btn;
}
