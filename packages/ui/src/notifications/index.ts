/**
 * Non-blocking notification system: a corner-anchored toast region plus a
 * notification centre so dismissed toasts stay reviewable. Modal dialogs
 * (see components/dialog.ts) are reserved strictly for decisions the user
 * must make before continuing — everything informational goes through here.
 */

import { h, Store } from "../dom";
import { snackbar, SnackbarSeverity } from "../components/snackbar";
import { button } from "../components/button";
import { badge } from "../components/badge";
import { t } from "../i18n";

export interface NotificationRecord {
  id: string;
  message: string;
  severity: SnackbarSeverity;
  createdAt: number;
  dismissedAt: number | null;
  actionLabel?: string;
}

export interface NotifyOptions {
  message: string;
  severity?: SnackbarSeverity;
  actionLabel?: string;
  onAction?: () => void;
  autoDismissMs?: number | null;
}

export type ToastCorner = "bottom-right" | "bottom-left";

let region: HTMLDivElement | null = null;
let corner: ToastCorner = "bottom-right";
export const notificationHistory = new Store<NotificationRecord[]>([]);

function ensureRegion(): HTMLDivElement {
  if (region) return region;
  region = h("div.mm-toast-region", {
    class: `mm-toast-region mm-toast-region--${corner}`,
    role: "region",
    "aria-label": t("notifications.regionLabel"),
  });
  document.body.appendChild(region);
  return region;
}

export function setToastCorner(next: ToastCorner): void {
  corner = next;
  if (region) {
    region.classList.remove("mm-toast-region--bottom-left", "mm-toast-region--bottom-right");
    region.classList.add(`mm-toast-region--${corner}`);
  }
}

let counter = 0;

export function notify(opts: NotifyOptions): void {
  const id = `notif-${++counter}-${Date.now().toString(36)}`;
  const severity = opts.severity ?? "info";
  const record: NotificationRecord = {
    id,
    message: opts.message,
    severity,
    createdAt: Date.now(),
    dismissedAt: null,
    actionLabel: opts.actionLabel,
  };
  notificationHistory.update((list) => [record, ...list].slice(0, 200));

  const { el } = snackbar({
    message: opts.message,
    severity,
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
    autoDismissMs: opts.autoDismissMs,
    onDismiss: () => {
      notificationHistory.update((list) => list.map((r) => (r.id === id ? { ...r, dismissedAt: Date.now() } : r)));
    },
  });
  ensureRegion().appendChild(el);
}

export function notifyInfo(message: string): void {
  notify({ message, severity: "info" });
}
export function notifySuccess(message: string): void {
  notify({ message, severity: "success" });
}
export function notifyWarning(message: string): void {
  notify({ message, severity: "warning", autoDismissMs: null });
}
export function notifyError(message: string): void {
  notify({ message, severity: "error", autoDismissMs: null });
}

/** Builds a notification-centre trigger button carrying an unread-style count
 * badge (count of items dismissed within the last session view). */
export function notificationCentreTrigger(onOpen: () => void): HTMLButtonElement {
  const count = notificationHistory.getSnapshot().length;
  const btn = button({ label: t("notifications.centre.trigger"), variant: "icon", ariaLabel: t("notifications.centre.trigger"), onClick: onOpen });
  const b = badge(count, t("notifications.centre.count", { count }));
  if (b) btn.appendChild(b);
  return btn;
}

export function notificationCentrePanel(): HTMLDivElement {
  const root = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", padding: "8px" } });
  function render(list: NotificationRecord[]): void {
    root.textContent = "";
    if (list.length === 0) {
      root.appendChild(h("div", {}, t("common.state.empty")));
      return;
    }
    for (const record of list) {
      root.appendChild(
        h(
          "div.mm-card.mm-card--outlined",
          { style: { padding: "8px 12px" } },
          h("div", {}, record.message),
          h(
            "div",
            { style: { fontSize: "var(--mm-type-body-small-size)", color: "var(--mm-color-on-surface-variant)" } },
            new Date(record.createdAt).toLocaleTimeString()
          )
        )
      );
    }
  }
  notificationHistory.subscribe(render);
  render(notificationHistory.getSnapshot());
  return root;
}
