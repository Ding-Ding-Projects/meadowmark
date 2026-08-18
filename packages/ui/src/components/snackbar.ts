import { h } from "../dom";

export type SnackbarSeverity = "info" | "success" | "warning" | "error";

export interface SnackbarOptions {
  message: string;
  severity?: SnackbarSeverity;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss; errors/warnings should pass null (persist until dismissed). */
  autoDismissMs?: number | null;
  onDismiss?: () => void;
}

/** Builds a single toast element. Region placement/stacking is handled by notifications/. */
export function snackbar(opts: SnackbarOptions): { el: HTMLDivElement; dismiss: () => void } {
  const severity = opts.severity ?? "info";
  let dismissed = false;
  const el = h(
    "div.mm-toast",
    { class: `mm-toast mm-toast--${severity}`, role: severity === "error" || severity === "warning" ? "alert" : "status", "aria-live": "polite" },
    h("span", {}, opts.message),
    opts.actionLabel
      ? h(
          "button.mm-toast__action",
          {
            type: "button",
            onclick: () => {
              opts.onAction?.();
              dismiss();
            },
          },
          opts.actionLabel
        )
      : null,
    h(
      "button.mm-btn.mm-btn--icon",
      { type: "button", "aria-label": "Dismiss", style: { color: "inherit" }, onclick: () => dismiss() },
      "✕"
    )
  );

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    el.remove();
    opts.onDismiss?.();
  }

  const autoMs = opts.autoDismissMs === undefined ? (severity === "error" || severity === "warning" ? null : 5000) : opts.autoDismissMs;
  if (autoMs !== null) {
    setTimeout(dismiss, autoMs);
  }

  return { el, dismiss };
}
