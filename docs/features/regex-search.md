# Regex-powered search

## Behaviour

`packages/ui/src/search/regex-builder.ts` provides `searchField()` — a plain-
text search input (the default) paired with an affordance that opens a full
guided regex builder anchored beside that exact field via the shared overlay
system, never a separate page or a shared global dialog. Each `searchField()`
call owns its own independent `RegexFieldState` store (query, pattern, flags,
mode), so several search fields on one surface never share state.

The builder itself offers token buttons for literals, character classes,
anchors, groups (including named groups), alternation, and quantifiers; a raw
pattern editor; a flags input; a sample-text area with live match and
capture-group output; and a copy-to-clipboard action.

Every search field, every dropdown filter (`components/select.ts` via
`components/menu.ts`), and every context menu (`menus/context-menu.ts`) opens
this same builder, so behaviour never diverges between "the collection
search" and "the tiny four-item dropdown filter."

## Safety bounds

`compileGuardedRegex()` and `testGuardedRegex()` bound pattern length (500
chars), sample length (20,000 chars), match-iteration count (5,000), and
wall-clock time (50ms), reporting a truncated result rather than hanging the
UI thread on catastrophic backtracking or an unbounded match loop.

## Configuration

None; every field is self-contained.

## Failure modes

- An invalid pattern is reported inline as "Invalid pattern" rather than
  throwing — the field remains usable while the user fixes it.
- Evaluation never runs on a worker thread; a pathological pattern within the
  bounds above can still cause a brief, bounded UI stall (up to ~50ms) before
  the timeout guard reports a truncated result.

## Verification

Manual: open the builder from several different fields simultaneously (a
panel search, a dropdown filter, a context menu filter) and confirm each
keeps independent pattern/flags state; test an intentionally catastrophic
pattern against a long sample and confirm the UI reports a truncated result
rather than freezing.
