# HUD

## Behaviour

The persistent heads-up display (`packages/ui/src/hud/`) renders coins, cash,
an XP bar with the current level, population, energy, and barn fill — each
with an icon and a live value. It subscribes to the injected `GameStateView`
store (see `contracts.ts`) and re-renders on every state change; there is no
manual refresh call. The HUD is offset below the custom frameless title bar,
so the title bar no longer clips the top edge of the resource chips.

## Configuration

Visual density follows Settings → General → Density (`--mm-density-scale`).
Icons are placeholder emoji (coin, banknote, house, lightning bolt, barn)
pending final art from the game's asset pipeline — swapping them for real
icon assets is a drop-in change to `hud/index.ts`'s icon map.

## Failure modes

- If `state$` never emits, the HUD renders once with the initial snapshot and
  then goes stale — this is a contract violation on the state-provider side,
  not something the HUD can detect from inside.
- Every stat has a tooltip (`attachTooltip`) carrying the full accessible
  label, so a truncated or icon-only value is never the only way to read it.

## Verification

Manual: mount with a mock `ReadonlyStore<GameStateView>` that emits a few
different snapshots and confirm every tile updates, the XP bar fraction
matches `xp / xpForNextLevel`, and the barn fill bar matches
`used / capacity`. Runtime: launch the built app and confirm the HUD top is
below the title bar bottom.

Evidence status: the packaged capture from commit `c328d7d` shows the HUD below
the custom title bar. It does not prove every value update, scale, language,
theme, or narrow-layout state.

## Security considerations

HUD values are read-only projections. Currency, experience, capacity, and
progress must never be accepted back from rendered text as authoritative state.

## Suggested articles

- [Fields](./fields.md)
- [Material Design 3 token system](./design-system.md)
- [UI, engine, and shared integration](./integration-contract.md)
