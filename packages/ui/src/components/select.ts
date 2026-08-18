import { h, uid } from "../dom";
import { openMenu } from "./menu";

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
  const labelId = uid("select-label");
  const trigger = h(
    "button.mm-text-field__input",
    {
      type: "button",
      style: { textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" },
      "aria-haspopup": "listbox",
      "aria-labelledby": labelId,
      "aria-expanded": "false",
      onclick: () => {
        trigger.setAttribute("aria-expanded", "true");
        openMenu({
          anchor: trigger,
          role: "listbox",
          onClose: () => trigger.setAttribute("aria-expanded", "false"),
          filterAriaLabel: opts.labelText,
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
    h("span.mm-text-field__label", { id: labelId }, opts.labelText),
    h("div.mm-select", {}, trigger)
  );
}
