# Meadowmark roadmap

This roadmap separates code that exists from behavior that is release-proven.
The manually verified published baseline is `v0.1.51` at `e5335a1`.

## Verified baseline

- [x] Strict TypeScript workspaces for shared simulation, rendering engine,
  Material Design 3 UI, renderer adapter, and Electron main process.
- [x] Unsigned Squirrel.Windows setup, full package, and release index published
  and read back for `v0.1.51`.
- [x] Packaged baseline capture from `c328d7d` showing terrain, field beds,
  readable crop selection, navigation rail, and HUD.
- [x] Base settings store wired through main-process IPC and the preload bridge.

## Release-readiness work

- [ ] Exercise real gameplay actions in the packaged app and record their state
  transitions independently of the source modules.
- [ ] Capture every user-facing destination and required state from the final
  packaged candidate; the single `c328d7d` image is not a complete matrix.
- [ ] Add focused local verification for every inventory row, including a
  deliberate negative-regression proof.
- [ ] Verify keyboard, screen-reader, high-scale, bilingual, narrow-layout,
  reduced-motion, and both-theme behavior.
- [ ] Verify install, update, rollback, repair, and offline behavior.

## Platform service integration

The following modules exist but remain incomplete until they have validated IPC,
preload, UI, focused checks, packaged interaction, documentation, and capture
evidence:

- [ ] authenticator and QR/TOTP flows;
- [ ] toy locks, recovery ladder, and local history;
- [ ] file conversion and export;
- [ ] logo customization;
- [ ] narration and personal vocabulary;
- [ ] local Ollama management;
- [ ] scheduled and external settings sources; and
- [ ] unsigned automatic updates.

## Gameplay and presentation

- [ ] Replace hard-coded renderer layouts with simulation-owned world positions.
- [ ] Complete placement selection, rotation, cancellation, collection, plot
  unlocking, and museum donation actions.
- [ ] Prove the full tab, search, overlay, notification, palette, and destructive
  confirmation contracts in the packaged application.
- [ ] Keep the documentation site synchronized with shipped, verified behavior.

## Completion boundary

Meadowmark is not considered a finished playable game until the final candidate
has a complete evidence chain: implementation, documentation, localization,
focused local checks, packaged interaction, real captures, release assets, and a
successful publication run for the same commit.
