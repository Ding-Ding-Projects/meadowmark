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

In the packaged app, service-owned settings hydrate through the Electron
preload bridge from `packages/app/src/services/settings/SettingsStore`, which
validates and atomically persists the versioned `settings.json` document in
the stable application data directory. The bridge currently persists the
settings that overlap the existing UI: theme, density, accent colour, UI font
family, UI font-size scale, and the dialog emoji toggle.

The browser/static fallback still persists the whole UI settings snapshot to
`localStorage` under `meadowmark.settings.v1`; corrupt or missing storage falls
back to documented defaults rather than throwing. Local-only UI controls that
are not yet part of the app settings service, such as tab docking and render
quality, continue to use that fallback until their service schema lands.

## Failure modes

- The `--mm-density-scale` and `--mm-seed-hue` CSS variables are applied both
  on initial mount (`mountUi`) and on every settings change — a settings
  change made before `mountUi` runs (unlikely in normal flow) would not be
  reflected until mount.
- If the Electron settings service bridge fails to load, the UI keeps the
  localStorage fallback instead of blocking startup. Service load warnings are
  carried on the IPC payload, but the current settings panel does not yet show
  them inline.
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

The settings service IPC bridge was implemented in an earlier speed-focused
pass without tests, lint, type-checking, reviews, audits, or captures. The
`c328d7d` packaged capture shows application launch and first paint only; it
does not independently prove settings-service hydration, mutation, or
persistence.

## Security considerations

Settings are validated in the privileged process and written atomically.
Display-name or appearance changes must not alter the app ID, data directory,
executable, update feed, or package identity. External-source credentials and
personal-vocabulary payloads require their separate private storage boundaries.

## Suggested articles

- [Scheduled and external settings](./platform-services/scheduled-settings.md)
- [Internationalisation and funny levels](./i18n.md)
- [Material Design 3 token system](./design-system.md)
