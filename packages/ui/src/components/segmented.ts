import { h } from "../dom";

export interface SegmentedOption {
  value: string;
  label: string;
}

export function segmentedButton(options: SegmentedOption[], value: string, onChange: (value: string) => void, ariaLabel: string): HTMLDivElement {
  const root = h("div.mm-segmented", { role: "group", "aria-label": ariaLabel });
  for (const opt of options) {
    root.appendChild(
      h(
        "button.mm-segmented__btn",
        {
          type: "button",
          "aria-pressed": String(opt.value === value),
          onclick: () => {
            onChange(opt.value);
            Array.from(root.children).forEach((c, i) => c.setAttribute("aria-pressed", String(options[i]?.value === opt.value)));
          },
        },
        opt.label
      )
    );
  }
  return root;
}
