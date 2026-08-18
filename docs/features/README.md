# Meadowmark feature documentation

This is the categorized documentation index for Meadowmark at published
baseline `v0.1.0-22` / `dd2a44f`. Each feature article records behavior,
configuration, failure modes, security considerations, verification evidence,
and suggested related articles. A source module is not treated as UI or runtime
proof.

## Category indexes

- [Gameplay](./gameplay/README.md)
- [Interface](./interface/README.md)
- [Platform services](./platform-services/README.md)

## Design system

- [Material Design 3 token system](./design-system.md)

## Game interface

- [HUD](./hud.md)
- [Fields](./fields.md)
- [Factories](./factories.md)
- [Barn](./barn.md)
- [Orders](./orders.md)
- [Delivery vehicles (train, helicopter, ship)](./delivery-vehicles.md)
- [Town](./town.md)
- [Zoo, mine, and museum](./zoo-mine-museum.md)
- [Achievements, dailies, and the local-only village](./achievements-dailies-village.md)
- [Offline summary](./offline-summary.md)

## Shared systems

- [Internationalisation and funny levels](./i18n.md)
- [Settings](./settings.md)
- [Regex-powered search](./regex-search.md)
- [Notifications](./notifications.md)
- [Destructive-action confirmation](./super-confirm.md)
- [Command palette](./command-palette.md)
- [Overlays and context menus](./overlays-and-menus.md)

## Integration

- [UI/engine/shared integration contract](./integration-contract.md)

## Platform services

- [Authenticator, toy locks, and local history](./platform-services/auth-locks-history.md)
- [File conversion and export](./platform-services/file-conversion-exports.md)
- [Logo customization pipeline](./platform-services/logo-customization.md)
- [Narration and personal vocabulary](./platform-services/narration-personal-vocabulary.md)
- [Local Ollama manager](./platform-services/ollama-manager.md)
- [Scheduled and external settings](./platform-services/scheduled-settings.md)
- [Unsigned automatic updates](./platform-services/updater.md)

## Current capture boundary

The only real packaged-app capture is
[`meadowmark-packaged-terrain-fields.png`](../assets/captures/meadowmark-packaged-terrain-fields.png),
recorded from commit
[`c328d7d`](https://github.com/Ding-Ding-Projects/meadowmark/commit/c328d7d3552aa46f22766de9d5bf763cdfe15bc1).
It proves only the visible terrain/field-bed baseline in that artifact, not the
full feature list or a final candidate.
