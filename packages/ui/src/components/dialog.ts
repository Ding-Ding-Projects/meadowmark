import { Child, h } from "../dom";
import { t } from "../i18n";

export interface DialogOptions {
  titleKey: string;
  titleVars?: Record<string, string | number>;
  body: Child[];
  /** Actions rendered right-aligned; supply your own button() elements. */
  actions?: HTMLElement[];
  onClose?: () => void;
  /** Dialogs are reserved strictly for decisions the user must make before continuing. */
  labelledBy?: string;
}

export interface OpenDialogHandle {
  close(): void;
  root: HTMLDivElement;
}

/**
 * Opens a blocking modal dialog. Use ONLY for confirmations, unsaved-change
 * prompts, destructive-action gates, or credential/consent steps — everything
 * else (info, success, progress) must be a non-blocking notification instead.
 */
export function openDialog(opts: DialogOptions): OpenDialogHandle {
  const titleId = `mm-dialog-title-${Math.random().toString(36).slice(2)}`;
  const scrim = h("div.mm-scrim", {});
  const surface = h(
    "div.mm-dialog__surface",
    { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" },
    h("h2.mm-dialog__title", { id: titleId }, t(opts.titleKey, opts.titleVars)),
    h("div.mm-dialog__body", {}, ...opts.body),
    opts.actions ? h("div.mm-dialog__actions", {}, ...opts.actions) : null
  );
  const root = h("div.mm-dialog", {}, surface);

  const previouslyFocused = document.activeElement as HTMLElement | null;

  function close(): void {
    root.remove();
    scrim.remove();
    document.removeEventListener("keydown", onKeydown);
    previouslyFocused?.focus?.();
    opts.onClose?.();
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key === "Tab") {
      const focusables = surface.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) {
        // Nothing focusable rendered yet (or ever) inside the dialog — trap
        // focus on the dialog surface itself rather than throwing, so a
        // keyboard user is never stranded with Tab doing nothing useful.
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

  return { close, root };
}
