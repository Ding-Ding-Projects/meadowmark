# Overlays and context menus

## Behaviour

`packages/ui/src/overlays.ts` is the shared popover/menu machinery underneath
dropdowns (`components/select.ts`), context menus (`menus/context-menu.ts`),
the regex builder popover, and any future anchored surface. It guarantees:

- The overlay always paints its own background, border, elevation, and shape
  (never relying on the anchor's stacking context to avoid a transparent
  overlay that lets page content read through the text on top).
- The overlay is bounded by the viewport and scrolls internally
  (`max-height` + `overflow-y: auto`) rather than clipping content silently
  past a hard cap.
- The overlay never covers the control that opened it — `reposition()` flips
  between above/below the anchor to keep both visible when space allows.
- Closing (outside click, Escape, or programmatic `close()`) always returns
  focus to whatever was focused before the overlay opened.

`components/menu.ts` builds on this with a keyboard-navigable, filterable
item list — used identically for dropdown selects and for right-click
context menus (`menus/context-menu.ts`) so the two never diverge in
behaviour. Every menu item that declares a `shortcut` string displays it
right-aligned; `menus/context-menu.ts` also exposes a small shortcut-display
registry so a context menu can show the same string the real keymap/palette
uses, rather than a separately hand-typed (and driftable) label.

## Configuration

None; every call site supplies its own items and anchor.

## Failure modes

- The filter never changes what a menu item does — only which items are
  visible — per the project's explicit "consistency is the feature, not an
  exemption for short menus" requirement. There is no menu in this package
  with fewer than the full filter+shortcut treatment.
- `shortcutDisplayFor()` returns `undefined` for an unregistered command id;
  callers should register a display string alongside registering the actual
  key binding (in the host/keymap layer) so the two cannot silently drift
  apart, but this package cannot enforce that registration happened.

## Verification

Manual: open an overlay near each viewport edge and confirm it repositions
to stay fully visible and never covers its anchor; open a menu with more
items than fit the viewport height and confirm it scrolls internally rather
than clipping; type into a context menu's filter and confirm only the label
text changes, never the action wired to a surviving item.

Evidence status: this is a prescribed manual procedure; viewport collision,
scrolling, context-menu filtering, focus return, and narrow-layout behavior
have no packaged interaction record or capture at `6e7760b`.

## Security considerations

Filtered or hidden items must not retain reachable destructive shortcuts.
Overlay content sourced outside the app requires isolated rendering and bounded
text; menus may invoke only registered actions with their normal validation.

## Suggested articles

- [Regex-powered search](./regex-search.md)
- [Command palette](./command-palette.md)
- [Material Design 3 token system](./design-system.md)
