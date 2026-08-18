import { h } from "../dom";
import { openMenu } from "./menu";

let nextSelectId = 0;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectOptions {
  labelText: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

/** An M3 select surfaced as a button that opens the shared filterable menu. */
export function select(opts: SelectOptions): HTMLDivElement {
  const current = opts.options.find((o) => o.value === opts.value);
  const labelId = `mm-select-label-${nextSelectId++}`;
  let expanded = false;
  const trigger = h(
    "button.mm-text-field__input",
    {
      type: "button",
      style: { textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" },
      "aria-haspopup": "menu",
      // The visible <label> below is the accessible name — programmatically
      // associated here rather than relying on adjacency, which most screen
      // readers do not infer for a <button> the way they do for a native
      // <select> or a <label for>-linked <input>.
      "aria-labelledby": labelId,
      "aria-expanded": "false",
      onclick: () => {
        expanded = true;
        trigger.setAttribute("aria-expanded", "true");
        openMenu({
          anchor: trigger,
          filterAriaLabel: opts.labelText,
          onClose: () => {
            expanded = false;
            trigger.setAttribute("aria-expanded", "false");
          },
          items: opts.options.map((o) => ({
            id: o.value,
            label: o.label,
            disabled: o.disabled,
            disabledReason: o.disabledReason,
            onSelect: () => {
              opts.onChange(o.value);
              trigger.querySelector(".mm-select__value")!.textContent = o.label;
            },
          })),
        });
      },
    },
    h("span.mm-select__value", {}, current?.label ?? ""),
    h("span", { "aria-hidden": "true" }, "▾")
  );
  return h(
    "div.mm-text-field",
    {},
    h("label.mm-text-field__label", { id: labelId }, opts.labelText),
    h("div.mm-select", {}, trigger)
  );
}
