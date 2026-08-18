/**
 * Small, purely decorative game-feel effects: a floating "+N" number when a
 * harvest or collection lands, and a level-up celebration pulse. Nothing
 * here changes game state or reads anything beyond what the caller already
 * knows — these are readability aids over real events, not new facts.
 *
 * Every effect respects prefers-reduced-motion: the floating number still
 * appears and is still legible for a moment (the information is never lost),
 * it simply does not rise and CSS disables the celebration transform, per
 * tokens.css's global motion-duration override and the explicit @media
 * guards in effects.css.
 */

import { h, prefersReducedMotion } from "../dom";

export type FeedbackTone = "coins" | "cash" | "xp" | "good";

let liveRegion: HTMLDivElement | null = null;

function ensureLiveRegion(): HTMLDivElement {
  if (liveRegion) return liveRegion;
  liveRegion = h("div.mm-visually-hidden", { role: "status", "aria-live": "polite" });
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/**
 * Spawns a floating number/text that rises and fades above `anchor`, then
 * removes itself. Appended to document.body and absolutely positioned over
 * the anchor's current screen rect, so it never disturbs the layout of
 * whatever it is celebrating. `announce`, when given, is also pushed through
 * a visually-hidden live region so a screen-reader user gets the same fact
 * a sighted player reads off the floating number.
 */
export function spawnFloatingText(anchor: HTMLElement, text: string, tone: FeedbackTone = "good", announce?: string): void {
  const rect = anchor.getBoundingClientRect();
  const el = h(
    "div.mm-float-num",
    {
      class: `mm-float-num mm-float-num--${tone}`,
      "aria-hidden": "true",
      style: {
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top}px`,
      },
    },
    text
  );
  document.body.appendChild(el);
  const durationMs = prefersReducedMotion() ? 900 : 1100;
  window.setTimeout(() => el.remove(), durationMs);

  if (announce) {
    const region = ensureLiveRegion();
    region.textContent = announce;
  }
}

/**
 * Briefly glows `el` to celebrate a level-up or similar milestone. Safe to
 * call repeatedly in quick succession — it forces a reflow so a second
 * celebration restarts the animation instead of being swallowed by the
 * first one still running.
 */
export function celebrate(el: HTMLElement): void {
  el.classList.remove("mm-celebrate");
  void el.offsetWidth;
  el.classList.add("mm-celebrate");
  const durationMs = prefersReducedMotion() ? 50 : 900;
  window.setTimeout(() => el.classList.remove("mm-celebrate"), durationMs);
}
