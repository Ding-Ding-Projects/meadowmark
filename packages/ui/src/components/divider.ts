import { h } from "../dom";

export function divider(): HTMLHRElement {
  return h("hr.mm-divider", { role: "separator" });
}
