import { Child, h } from "../dom";

export interface ListItemOptions {
  titleText: string;
  subtitleText?: string;
  leading?: Child;
  trailing?: Child;
  onClick?: () => void;
  selected?: boolean;
  ariaLabel?: string;
}

export function listItem(opts: ListItemOptions): HTMLLIElement {
  return h(
    "li.mm-list-item",
    {
      role: opts.onClick ? "button" : undefined,
      tabindex: opts.onClick ? "0" : undefined,
      "aria-pressed": opts.onClick && opts.selected !== undefined ? String(!!opts.selected) : undefined,
      "aria-label": opts.ariaLabel,
      onclick: opts.onClick,
      onkeydown: opts.onClick
        ? (ev: KeyboardEvent) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              opts.onClick?.();
            }
          }
        : undefined,
    },
    opts.leading ? h("div.mm-list-item__leading", {}, opts.leading) : null,
    h(
      "div.mm-list-item__body",
      {},
      h("div.mm-list-item__title", {}, opts.titleText),
      opts.subtitleText ? h("div.mm-list-item__subtitle", {}, opts.subtitleText) : null
    ),
    opts.trailing ? h("div.mm-list-item__trailing", {}, opts.trailing) : null
  );
}

export function list(...items: HTMLLIElement[]): HTMLUListElement {
  return h("ul.mm-list", { role: "list" }, ...items);
}
