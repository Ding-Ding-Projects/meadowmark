# Local version history

## Behaviour

Meadowmark keeps a local, Git-backed version history of the records it owns:
game saves and the settings document. `packages/app/src/services/history`
implements an isolated git repository (never the player's own folder, never
the app's own source checkout) that receives a new commit every time one of
those records changes.

The "History" tab in Settings (`packages/ui/src/history/index.ts`) lists
every recorded revision — its date, message, changed record paths, and any
labels — with a search field wired to the shared regex builder. Each
revision offers:

- **Label**, which attaches a free-text note (stored as a git note) so a
  revision worth keeping is exempt from pruning and easy to find later.
- **Restore**, which writes the revision's content for its first changed
  record back over the live file, recorded itself as a new commit (history
  is append-only: restoring never rewinds or deletes anything).

A **Copy changelog** action exports the whole history as a human-readable,
content-free changelog (dates, messages, actions, labels — no raw file
content) to the clipboard.

## What triggers a snapshot

`packages/app/src/ipc.ts` calls `HistoryStore.commitSnapshot()` after two
operations complete, never blocking or failing them if history itself fails:

- **Saving the game** (`game:save`) records `saves/save.json`, with a
  message naming the farm when the state carries one ("Saved Riverside
  Hollow") or a generic "Saved the farm" otherwise.
- **Any settings write** (`settings-service:set`, `:set-many`,
  `:reset-to-default`, `:reset-all-to-defaults`) records `settings.json`,
  with a message naming the changed keys ("Changed settings: theme,
  density").

An unchanged write (byte-identical content) records nothing — see
`CommitResult.committed` — so the panel stays a list of real events rather
than a wall of no-op commits.

## Restoring a record back to its live location

`HistoryStore.restoreRevision()` only knows about its own isolated
repository; it has no idea where `settings.json` or `saves/save.json`
actually live in the running app. `ipc.ts`'s `historyRestoreRevision`
handler closes that loop itself, immediately after the store call returns:
a restored `settings.json` is parsed and written back through the same
`SettingsStore.setMany()` path a normal settings change uses (so
provenance and validation still apply), and a restored `saves/save.json`
is parsed and written back through the same `JsonStore` the normal save
path uses. A record this main process does not itself own is still
recovered inside the history repository (and the revision the UI showed
is still real) even though nothing here applies it anywhere live.

## Configuration

The history repository lives at `<app data dir>/history`, via
`defaultHistoryRepoDir()`. It requires `git` to be installed and on `PATH`;
`HistoryStore.init()` detects this and reports an honest "unavailable"
state (surfaced verbatim in the History tab) rather than failing silently
or crashing when it is not.

## Failure modes

- No `git` on `PATH`: the History tab shows `history.unavailable` with the
  detected reason; saves and settings writes continue to work normally —
  history is a convenience layered on top of them, never a gate.
- The browser/static fallback build (no Electron host) has no
  `window.meadowmark.history` bridge at all; the History tab shows the same
  unavailable state rather than throwing.
- Diffing between two revisions (`HistoryStore.diffRevisions`) and pruning
  (`HistoryStore.prune`) are wired through IPC and the preload bridge but
  have no UI surface yet — the History tab currently only lists, labels,
  restores, and exports.
- Restore only applies a record back to its live location for the two
  record paths this main process knows about (`settings.json`,
  `saves/save.json`); any other recorded path is restored inside the
  history repository only.

## Verification

Manual: `npx tsc -p packages/app/tsconfig.json --noEmit`, `npx tsc -p
packages/ui/tsconfig.json --noEmit`, `npx tsc -p
packages/renderer/tsconfig.json --noEmit`, then `npm run build` (all
clean), `node tools/guards/no-fs-in-preload.mjs` (confirms the preload
bundle still requires only `electron`), and `node
tools/inventory/check.mjs`. No automated tests exist yet for this wiring —
this row is marked `partial`, not `done`, until a focused test suite and a
real built-artifact capture of the History tab exist.
