# Command palette

## Behaviour

`packages/ui/src/palette/command-palette.ts` implements the global command
palette, activated by `Ctrl+Shift+F` (installed once via
`installCommandPaletteHotkey()` in `mountUi`). Feature surfaces register
searchable items via `registerPaletteSource()`, which returns a mix of:

- **Commands**: a label plus a `run()` action.
- **Destinations**: a label plus a `teleport()` action that opens the owning
  surface, selects the right tab, scrolls the target into view, focuses it,
  and briefly highlights it — never just "opens a general page and leaves the
  user to hunt."
- **Settings**: a label plus a `renderControl()` that returns the actual live
  control (switch, slider, etc.), wired to the same state as the real
  settings surface, rendered inline in the results list.

Results are filtered by a simple case-insensitive substring match against the
label as the user types; the palette itself does not use the regex builder
(it is a quick-access surface, not a search-and-filter one), capped to the
first 100 matches.

Size is persisted (`card` default, or `fullscreen`) via `paletteSizeStore`.

## Keyboard navigation into rich results

Every row is keyboard-reachable end to end, not just pointer-reachable —
this matters specifically because the palette itself is opened with a
keyboard shortcut. From the search input, Arrow Down moves focus to the
first result row; from a row, Arrow Up/Down move to the previous/next row.
For a setting row, Enter is the deliberate key that steps focus INTO the
row's live embedded control (Tab reaches it too, via ordinary DOM focus
order, since the control sits inside the row). While focus is inside that
embedded control, Escape leaves the control and returns focus to the row —
it does not close the whole palette; the palette-level Escape-to-close
handler only fires when the key event is not first intercepted by the
control.

## Configuration

`mountUi` registers one destination per top-level nav tab out of the box.
Additional feature-specific commands/settings should call
`registerPaletteSource()` at module load time from their own panel/surface
module.

## Failure modes

- A registered source that throws during `allResults()` is caught and
  contributes zero results rather than breaking the whole palette — a
  misbehaving source degrades gracefully instead of taking every other
  source down with it.
## Verification

Manual: open with `Ctrl+Shift+F`, confirm every registered nav destination
appears and teleports correctly (tab switches, target highlights); confirm a
broken/throwing source does not prevent other results from rendering; from
the keyboard only, Arrow-Down from the search field into the result list,
Arrow Up/Down between rows, Enter into a setting row's embedded control,
adjust the control, then Escape back out to the row without the palette
closing.
