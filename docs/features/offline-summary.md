# Offline summary

## Behaviour

`panels/offline-summary.ts` opens a modal dialog (this is one of the
legitimate uses of a blocking dialog — the returning player needs to
acknowledge what happened) listing exactly what happened while away: away
duration, crops auto-harvested, coins and XP earned, goods produced, expired
orders (called out in the error colour), and arrived vehicles.

The main entry point watches the game state for a non-null pending offline
summary and opens this dialog automatically on mount and on every subsequent
change. Closing it, whether via the Close button, Escape, or clicking the
scrim, dispatches an acknowledgement action so the host can clear the
pending flag.

## Configuration

None.

## Failure modes

- If the host never clears the pending summary after acknowledgement, the
  dialog will reopen on the next state emission — the acknowledge dispatch
  is the host's cue to null it out.

## Verification

Manual: mock a game state with a populated pending offline summary, confirm
the dialog opens with correct figures, and confirm closing it dispatches the
acknowledge action exactly once.

Evidence status: this is a prescribed manual procedure. Offline simulation
chunk invariance has a committed executable check, but the packaged summary
dialog and acknowledgement path have no recorded interaction/capture.

## Security considerations

The summary is a projection of locally computed state. It must not trust elapsed
time, reward totals, or acknowledgement values supplied by renderer markup, and
it must not expose private save paths.

## Suggested articles

- [Fields](./fields.md)
- [HUD](./hud.md)
- [UI, engine, and shared integration](./integration-contract.md)
