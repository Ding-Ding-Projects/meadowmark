import { h } from "../dom";

export interface ChipOptions {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function chip(opts: ChipOptions): HTMLButtonElement {
  return h(
    "button.mm-chip",
    {
      type: "button",
      "aria-selected": String(!!opts.selected),
      disabled: !!opts.disabled,
      onclick: opts.onClick,
    },
    opts.label
  );
}
