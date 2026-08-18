/**
 * First-run welcome: a short, dismissible, non-blocking card that names the
 * core loop (grow, produce, deliver, build) and points at the first real
 * action — planting a crop on the Fields tab — then gets out of the way for
 * good.
 *
 * Contract:
 *  - Never blocking. It is appended alongside the rest of the interface and
 *    never delays `mountUi` finishing, never traps focus, and never steals
 *    focus on mount (same rule this project applies to the dim sum surprise
 *    and to every non-blocking notification).
 *  - Dismissible and shown at most once per install: a small persisted flag
 *    in localStorage, exactly like settings/store.ts and i18n/index.ts do
 *    for their own state, with a corruption-safe fallback to "not seen".
 *  - Respects prefers-reduced-motion via onboarding.css's @media guard, the
 *    same pattern effects.css already uses for the floating numbers and the
 *    level-up celebration.
 */

import { h } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";

const STORAGE_KEY = "meadowmark.onboarding.v1";
const SPOTLIGHT_TARGET_ID = "mm-tab-fields";

interface OnboardingState {
  seen: boolean;
}

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return { seen: parsed.seen === true };
    }
  } catch {
    // Corrupt or unavailable storage: fall through and treat as unseen
    // rather than ever hiding a first-run player's only orientation.
  }
  return { seen: false };
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort persistence only; the card simply reappears next launch
    // if storage is unavailable, which is the safe direction to fail in.
  }
}

export function hasSeenOnboarding(): boolean {
  return loadState().seen;
}

/** Clears the "seen" flag so the welcome card is shown again. Wired to the
 * settings surface's "Replay welcome tour" action. */
export function resetOnboarding(): void {
  saveState({ seen: false });
}

function markSeen(): void {
  saveState({ seen: true });
}

interface LoopStep {
  icon: string;
  labelKey: string;
}

const LOOP_STEPS: LoopStep[] = [
  { icon: "🌱", labelKey: "onboarding.step.grow" },
  { icon: "🏭", labelKey: "onboarding.step.produce" },
  { icon: "🚂", labelKey: "onboarding.step.deliver" },
  { icon: "🏘️", labelKey: "onboarding.step.build" },
];

export interface OnboardingOptions {
  /** Called once, when the player dismisses the card via its primary action
   * (not via the plain close control) — used to make sure the Fields tab is
   * the one on screen when they go looking for their first crop. */
  onStartFirstAction?: () => void;
}

/**
 * Mounts the first-run welcome card into `document.body` if (and only if)
 * it has never been dismissed before. Always returns a disposer, even when
 * nothing was mounted, so callers never need to branch on whether this ran.
 */
export function mountOnboarding(opts: OnboardingOptions = {}): () => void {
  if (hasSeenOnboarding()) {
    return () => {};
  }

  const spotlightTarget = document.getElementById(SPOTLIGHT_TARGET_ID);
  spotlightTarget?.classList.add("mm-onboarding-spotlight");

  function clearSpotlight(): void {
    spotlightTarget?.classList.remove("mm-onboarding-spotlight");
  }

  /** Tears down the card's DOM and listeners without necessarily marking it
   * "seen" — used both by a real user dismissal and by an involuntary
   * unmount (app teardown, hot reload), which must NOT suppress the card on
   * the player's next real launch just because this mount happened to end. */
  function teardown(): void {
    clearSpotlight();
    document.removeEventListener("keydown", onKeydown);
    card.remove();
  }

  function dismiss(startFirstAction: boolean): void {
    markSeen();
    teardown();
    if (startFirstAction) opts.onStartFirstAction?.();
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      dismiss(false);
    }
  }

  const titleId = "mm-onboarding-title";
  const stepsList = h(
    "ol.mm-onboarding__steps",
    { "aria-label": t("onboarding.stepsLabel") },
    ...LOOP_STEPS.map((step) =>
      h(
        "li.mm-onboarding__step",
        {},
        h("span.mm-onboarding__step-icon", { "aria-hidden": "true" }, step.icon),
        h("span", {}, t(step.labelKey))
      )
    )
  );

  const closeBtn = button({
    label: t("onboarding.dismiss"),
    variant: "icon",
    ariaLabel: t("onboarding.dismiss"),
    iconHtml: "&#x2715;",
    onClick: () => dismiss(false),
  });
  closeBtn.classList.add("mm-onboarding__close");

  const startBtn = button({
    label: t("onboarding.start"),
    variant: "filled",
    onClick: () => dismiss(true),
  });

  const card = h(
    "div.mm-onboarding",
    { role: "region", "aria-labelledby": titleId },
    closeBtn,
    h("h2.mm-onboarding__title", { id: titleId }, t("onboarding.title")),
    h("p.mm-onboarding__lede", {}, t("onboarding.lede")),
    stepsList,
    h("div.mm-onboarding__actions", {}, startBtn)
  );

  document.body.appendChild(card);
  document.addEventListener("keydown", onKeydown);

  return teardown;
}
