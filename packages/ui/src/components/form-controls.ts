import { h } from "../dom";

// --------------------------------------------------------------------------
// Switch
// --------------------------------------------------------------------------

export interface SwitchOptions {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function switchControl(opts: SwitchOptions): HTMLDivElement {
  let checked = opts.checked;
  const track = h("span.mm-switch__track", {}, h("span.mm-switch__thumb", {}));
  const root = h(
    "div.mm-switch",
    {
      role: "switch",
      tabindex: opts.disabled ? "-1" : "0",
      "aria-checked": String(checked),
      "aria-label": opts.ariaLabel,
      "aria-disabled": opts.disabled ? "true" : undefined,
      onclick: () => toggle(),
      onkeydown: (ev: KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          toggle();
        }
      },
    },
    track
  );
  function toggle(): void {
    if (opts.disabled) return;
    checked = !checked;
    root.setAttribute("aria-checked", String(checked));
    opts.onChange(checked);
  }
  return root;
}

// --------------------------------------------------------------------------
// Checkbox
// --------------------------------------------------------------------------

export interface CheckboxOptions {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function checkbox(opts: CheckboxOptions): HTMLLabelElement {
  let checked = opts.checked;
  const box = h("span.mm-checkbox__box", { "aria-hidden": "true" }, checked ? "✓" : "");
  const root = h(
    "label.mm-checkbox",
    {
      role: "checkbox",
      tabindex: "0",
      "aria-checked": String(checked),
      onclick: (ev: MouseEvent) => {
        ev.preventDefault();
        toggle();
      },
      onkeydown: (ev: KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          toggle();
        }
      },
    },
    box,
    h("span", {}, opts.label)
  );
  function toggle(): void {
    checked = !checked;
    root.setAttribute("aria-checked", String(checked));
    box.textContent = checked ? "✓" : "";
    opts.onChange(checked);
  }
  return root;
}

// --------------------------------------------------------------------------
// Radio group
// --------------------------------------------------------------------------

export interface RadioOption {
  value: string;
  label: string;
}

export function radioGroup(
  name: string,
  options: RadioOption[],
  selected: string,
  onChange: (value: string) => void
): HTMLDivElement {
  const root = h("div", { role: "radiogroup", "aria-label": name });
  for (const opt of options) {
    const box = h("span.mm-radio__box", { "aria-hidden": "true" });
    const item = h(
      "label.mm-radio",
      {
        role: "radio",
        tabindex: opt.value === selected ? "0" : "-1",
        "aria-checked": String(opt.value === selected),
        onclick: () => select(opt.value),
        onkeydown: (ev: KeyboardEvent) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(opt.value);
          }
        },
      },
      box,
      h("span", {}, opt.label)
    );
    root.appendChild(item);
  }
  function select(value: string): void {
    onChange(value);
    Array.from(root.children).forEach((child, i) => {
      const isSelected = options[i]?.value === value;
      child.setAttribute("aria-checked", String(isSelected));
      child.setAttribute("tabindex", isSelected ? "0" : "-1");
    });
  }
  return root;
}

// --------------------------------------------------------------------------
// Slider
// --------------------------------------------------------------------------

export interface SliderOptions {
  min: number;
  max: number;
  step?: number;
  value: number;
  onInput: (value: number) => void;
  ariaLabel: string;
  formatValue?: (value: number) => string;
}

export function slider(opts: SliderOptions): HTMLDivElement {
  const valueLabel = h("span.mm-type-label-medium", {}, opts.formatValue ? opts.formatValue(opts.value) : String(opts.value));
  const input = h("input.mm-slider__input", {
    type: "range",
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step ?? 1),
    value: String(opts.value),
    "aria-label": opts.ariaLabel,
    oninput: (ev: Event) => {
      const v = Number((ev.target as HTMLInputElement).value);
      valueLabel.textContent = opts.formatValue ? opts.formatValue(v) : String(v);
      opts.onInput(v);
    },
  });
  return h("div.mm-slider", {}, input, valueLabel);
}

// --------------------------------------------------------------------------
// Text field
// --------------------------------------------------------------------------

export interface TextFieldOptions {
  labelText: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  errorText?: string;
  type?: "text" | "search" | "number";
  leadingIconHtml?: string;
  trailingEl?: HTMLElement;
  id?: string;
}

export function textField(opts: TextFieldOptions): HTMLDivElement {
  const id = opts.id ?? `mm-field-${Math.random().toString(36).slice(2)}`;
  const input = h("input.mm-text-field__input", {
    id,
    type: opts.type ?? "text",
    value: opts.value,
    placeholder: opts.placeholder,
    "aria-describedby": opts.helpText || opts.errorText ? `${id}-help` : undefined,
    "aria-invalid": opts.errorText ? "true" : undefined,
    oninput: (ev: Event) => opts.onInput((ev.target as HTMLInputElement).value),
  });
  const row = h("div.mm-text-field__input-row", {}, input, opts.trailingEl ?? null);
  return h(
    "div.mm-text-field",
    {},
    h("label.mm-text-field__label", { for: id }, opts.labelText),
    row,
    opts.errorText
      ? h("div.mm-text-field__help.mm-text-field__help--error", { id: `${id}-help`, role: "alert" }, opts.errorText)
      : opts.helpText
        ? h("div.mm-text-field__help", { id: `${id}-help` }, opts.helpText)
        : null
  );
}
