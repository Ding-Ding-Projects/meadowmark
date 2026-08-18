# Settings

## Behaviour

`packages/ui/src/settings/index.ts` presents settings as browser-style tabs
(General, Appearance, Language, Render quality) rather than one long
scrolling column, with its own search field at the top wired to the shared
regex-powered search system. Typing a plain-text query lists matching
setting labels with a jump-to-tab action; the regex-builder affordance next
to the field opens the full anchored builder for power users.

Covered settings: theme (light/dark/system), density, accent/seed colour, UI
font family/size/weight, language mode, both funny-level sliders, the "show
emojis in dialogs" toggle, tab-strip docking edge, and render quality.

## Render quality: novice Speed control plus the real advanced values

Render quality exposes both a novice `Speed 1–5` slider and the underlying
advanced values (shadow quality, draw distance, particle density,
anti-aliasing) it maps to. Moving the Speed slider writes a known preset;
moving any individual advanced value re-classifies the current values against
every documented preset and shows `Custom` when they no longer match any of
them exactly — the novice control never silently guesses or snaps values it
did not just set.

## Configuration

Persisted to `localStorage` under `meadowmark.settings.v1`; corrupt or
missing storage falls back to documented defaults rather than throwing.

## Failure modes

- The `--mm-density-scale` and `--mm-seed-hue` CSS variables are applied both
  on initial mount (`mountUi`) and on every settings change — a settings
  change made before `mountUi` runs (unlikely in normal flow) would not be
  reflected until mount.
- Settings search currently indexes a small hand-maintained list of entries
  rather than deriving one from the live tab panels; adding a new setting
  control requires adding a matching `SettingEntry` in `settings/index.ts` or
  it will not appear in search results (though it will still be reachable via
  its tab).

## Verification

Manual: change each setting and confirm the live effect (theme, density,
accent hue, font, language, funny level, emoji toggle, render quality);
search for a setting's label and confirm the jump-to-tab action selects the
correct tab.
