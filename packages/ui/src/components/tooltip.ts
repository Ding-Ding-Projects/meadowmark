import { h } from "../dom";

/** Attaches a keyboard- and hover-accessible tooltip to `target`. `text` may
 * be a getter so the tooltip always shows the live value (e.g. a HUD stat
 * whose label text updates every tick) rather than whatever it was at
 * attach time. */
export function attachTooltip(target: HTMLElement, text: string | (() => string)): void {
  let tipEl: HTMLDivElement | null = null;
  const id = `mm-tooltip-${Math.random().toString(36).slice(2)}`;

  function resolveText(): string {
    return typeof text === "function" ? text() : text;
  }

  function show(): void {
    if (tipEl) return;
    tipEl = h("div.mm-tooltip", { role: "tooltip", id }, resolveText());
    document.body.appendChild(tipEl);
    const rect = target.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
    let top = rect.top - tipRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
    target.setAttribute("aria-describedby", id);
  }

  function hide(): void {
    tipEl?.remove();
    tipEl = null;
    target.removeAttribute("aria-describedby");
  }

  target.addEventListener("mouseenter", show);
  target.addEventListener("mouseleave", hide);
  target.addEventListener("focus", show);
  target.addEventListener("blur", hide);
  target.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hide();
  });
}
