# Notifications

## Behaviour

`packages/ui/src/notifications/index.ts` implements the non-blocking toast
system: `notify()` and its `notifyInfo/Success/Warning/Error` shorthands
render a corner-anchored toast (bottom-right by default, switchable to
bottom-left via `setToastCorner()`) that auto-dismisses after 5 seconds for
info/success severities, and persists until manually dismissed for
warning/error severities. Toasts stack without overlapping and may carry an
action label plus handler.

Every notification is also recorded to `notificationHistory`, a `Store`
consumed by `notificationCentrePanel()` so dismissed toasts stay reviewable,
and `notificationCentreTrigger()` renders a bell-style button carrying a
count badge.

Modal dialogs (`components/dialog.ts`, `confirm/super-confirm.ts`) are
reserved strictly for decisions the user must make before continuing —
informational, success, and progress messaging always goes through this
system instead.

## Configuration

Toast corner is a runtime call (`setToastCorner`); wiring it to a persisted
Settings control is a straightforward follow-up once the settings surface
grows a "notification corner" entry.

## Failure modes

- The toast region element is created lazily on first `notify()` call and
  never destroyed; this is intentional (it is a page-lifetime singleton) but
  means it persists even if every individual toast has been dismissed.
- `notificationHistory` is capped at 200 entries (oldest dropped) to bound
  memory over a long play session.

## Verification

Manual: trigger each severity and confirm auto-dismiss timing matches the
documented behaviour (info/success auto-dismiss, warning/error persist);
open the notification centre and confirm dismissed toasts still appear with
their original message and timestamp.

Evidence status: this is a prescribed manual procedure; no packaged
notification-stack or history interaction/capture is recorded at `6e7760b`.

## Security considerations

Notifications must not display secrets, tokens, private paths, or unbounded
external text. Errors remain factual at every language/funny setting, and a
notification action must revalidate the operation rather than replay stale
authority.

## Suggested articles

- [Internationalisation and funny levels](./i18n.md)
- [Overlays and context menus](./overlays-and-menus.md)
- [Unsigned automatic updates](./platform-services/updater.md)
