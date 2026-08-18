/**
 * The destructive-action super-confirmation gate. Built entirely in this
 * app's own DOM — never a separate window or hosted page.
 *
 * Contract:
 *  - Names the exact action and affected data.
 *  - Requires TWO independently operated key controls before the slider
 *    becomes usable.
 *  - Then a full-range confirmation slider must be dragged/moved to 100%.
 *  - A progress animation plays while the slider moves; a completion
 *    animation plays once it reaches the end.
 *  - An always-available emergency cancel and Escape both cancel instantly.
 *  - Focus returns to the control that opened the gate.
 *  - The action NEVER fires unless both keys AND the full slider completed.
 */

import { h } from "../dom";
import { t } from "../i18n";

export interface SuperConfirmOptions {
  /** Names the exact destructive action, e.g. "Demolish Bakery #3". */
  actionTitleKey: string;
  actionTitleVars?: Record<string, string | number>;
  /** Describes exactly what data/state is affected. */
  detailKey: string;
  detailVars?: Record<string, string | number>;
  onConfirmed: () => void;
  onCancelled?: () => void;
}

export function openSuperConfirm(opts: SuperConfirmOptions): void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  let key1 = false;
  let key2 = false;
  let sliderValue = 0;
  let completed = false;

  const key1Btn = h(
    "button.mm-btn.mm-btn--outlined",
    {
      type: "button",
      "aria-pressed": "false",
      onclick: () => {
        key1 = !key1;
        key1Btn.setAttribute("aria-pressed", String(key1));
        key1Btn.textContent = key1 ? t("confirm.key1Held") : t("confirm.key1");
        updateSliderEnabled();
      },
    },
    t("confirm.key1")
  );

  const key2Btn = h(
    "button.mm-btn.mm-btn--outlined",
    {
      type: "button",
      "aria-pressed": "false",
      onclick: () => {
        key2 = !key2;
        key2Btn.setAttribute("aria-pressed", String(key2));
        key2Btn.textContent = key2 ? t("confirm.key2Held") : t("confirm.key2");
        updateSliderEnabled();
      },
    },
    t("confirm.key2")
  );

  const sliderInput = h("input.mm-slider__input", {
    type: "range",
    min: "0",
    max: "100",
    value: "0",
    disabled: true,
    "aria-label": t("confirm.sliderLabel"),
  }) as HTMLInputElement;

  const progressBar = h("div.mm-progress-linear", { role: "progressbar", "aria-hidden": "true" }, h("div.mm-progress-linear__bar", { style: { width: "0%" } }));
  const progressBarFill = progressBar.firstElementChild as HTMLDivElement;

  const statusEl = h("div", { role: "status", "aria-live": "polite" }, t("confirm.notReady"));

  function updateSliderEnabled(): void {
    const ready = key1 && key2;
    sliderInput.disabled = !ready;
    statusEl.textContent = ready ? t("confirm.readyToSlide") : t("confirm.notReady");
  }

  sliderInput.addEventListener("input", () => {
    sliderValue = Number(sliderInput.value);
    progressBarFill.style.width = `${sliderValue}%`;
    if (sliderValue >= 100 && !completed) {
      completed = true;
      statusEl.textContent = t("confirm.completed");
      confirmBtn.disabled = false;
      playCompletionAnimation();
    } else if (sliderValue < 100) {
      completed = false;
      confirmBtn.disabled = true;
    }
  });

  function playCompletionAnimation(): void {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    progressBar.animate(
      [{ boxShadow: "0 0 0 0 var(--mm-color-primary)" }, { boxShadow: "0 0 0 6px transparent" }],
      { duration: 400, easing: "ease-out" }
    );
  }

  const confirmBtn = h(
    "button.mm-btn.mm-btn--danger",
    {
      type: "button",
      disabled: true,
      onclick: () => {
        if (!(key1 && key2 && sliderValue >= 100)) return;
        close();
        opts.onConfirmed();
      },
    },
    t("confirm.confirmAction")
  );

  const cancelBtn = h(
    "button.mm-btn.mm-btn--text",
    { type: "button", onclick: () => { close(); opts.onCancelled?.(); } },
    t("confirm.emergencyExit")
  );

  const scrim = h("div.mm-scrim", {});
  const titleId = `mm-superconfirm-title-${Date.now()}`;
  const surface = h(
    "div.mm-dialog__surface",
    { role: "alertdialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" },
    h("h2.mm-dialog__title", { id: titleId }, t(opts.actionTitleKey, opts.actionTitleVars)),
    h("p.mm-dialog__body", {}, t(opts.detailKey, opts.detailVars)),
    h("div", { style: { display: "flex", gap: "8px", margin: "16px 0" } }, key1Btn, key2Btn),
    h("div", { style: { margin: "8px 0" } }, sliderInput, progressBar),
    statusEl,
    h("div.mm-dialog__actions", {}, cancelBtn, confirmBtn)
  );
  const root = h("div.mm-dialog", {}, surface);

  function close(): void {
    root.remove();
    scrim.remove();
    document.removeEventListener("keydown", onKeydown);
    previouslyFocused?.focus?.();
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      opts.onCancelled?.();
    } else if (ev.key === "Tab") {
      const focusable = [key1Btn, key2Btn, sliderInput, cancelBtn, confirmBtn].filter((element) => !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    // This is the destructive-action gate -- of every modal in the app, the
    // one where a keyboard user tabbing straight past it into the page
    // behind the scrim matters most. Trap focus exactly as the ordinary
    // dialog does.
    if (ev.key === "Tab") {
      const focusables = surface.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) {
        ev.preventDefault();
        surface.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  document.body.appendChild(scrim);
  document.body.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  surface.focus();
}
