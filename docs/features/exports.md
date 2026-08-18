# Universal export

## Behaviour

Every application-owned record is exportable, in every text format that can
faithfully represent it. `packages/app/src/services/exports` is the export
engine: it turns a generic `ExportSource` (arbitrary structured data, or flat
tabular rows) into JSON, JSONL/NDJSON, YAML, TOML, XML, CSV, TSV, Markdown,
HTML, or SQL, plus a real hand-written ZIP writer and a 7z surface that
honestly reports itself unavailable (no bundled LZMA/PPMd backend ships with
this app).

The engine's usage contract: `computeLossReport(source, format)` is always
computed and shown to the user *before* anything is written. A format that
cannot carry something — a nested structure a tabular format has to flatten,
reduced numeric precision, a credential field — is still offered, but never
silently; the loss report names exactly what would be dropped and why.
Credential/secret fields (declared via `ExportField.sensitive`, plus a
conservative key-name heuristic as defense in depth) are always stripped and
always recorded as a loss entry, never a bare omission.

The "Export" tab in Settings (`packages/ui/src/exports/index.ts`) exposes
this for the two records the app currently owns end to end: the settings
document and the farm save. Choosing a dataset and a format immediately
recomputes and displays the loss report; the Export button then opens the
platform's native save dialog (via Electron's `dialog.showSaveDialog`, run
in the main process — a sandboxed preload cannot touch it directly) and, if
the user does not cancel, serializes and writes the file through the app's
atomic-write path (`packages/app/src/atomic-write.ts`, retry-on-rename for
Windows sharing violations). Every successful export also drops a labeled
snapshot into local version history (`exports/<dataset>`), the same way a
save or a settings change does.

## Wiring

Follows the same channels-then-ipc-then-preload-then-UI pipeline the
settings and history services used:

- `packages/app/src/ipc-channels.ts` — `exports:loss-report`, `exports:write`.
- `packages/app/src/ipc.ts` — builds an `ExportSource` from the live
  settings/save stores, computes the loss report, and (on write) drives the
  native save dialog before calling `writeExportFile`.
- `packages/app/src/preload.ts` — exposes `window.meadowmark.exports` with
  only type-only imports from the export engine and from `ipc.ts`'s
  `ExportDatasetId`, so the sandboxed preload bundle never pulls in
  `node:fs` (see `ipc-channels.ts`'s header comment for why that matters).
- `packages/ui/src/exports/bridge.ts` — the renderer-side bridge, typed
  loosely against `window.meadowmark.exports` the same way
  `packages/ui/src/history/bridge.ts` is.
- `packages/ui/src/exports/index.ts` — the panel itself, mounted as a
  Settings tab in `packages/ui/src/settings/index.ts`.

## Failure modes

- Running outside the Electron host (the browser/static fallback build) has
  no export bridge; the panel shows an honest "only available in the
  installed app" message instead of a broken control.
- Canceling the native save dialog reports "Export canceled" rather than a
  silent no-op or an error.
- A write failure (disk full, permission denied) is caught and shown with
  the real error text rather than a generic "something went wrong".

## Security considerations

Credential/secret fields never reach the serialized output, in any format —
see `packages/app/src/services/exports/secrets.ts`. The write path goes
through the app's atomic-write module, so a failed write cannot leave a
half-written file where a complete one was expected.

## Verification

`npx tsc -p packages/app/tsconfig.json --noEmit` and
`npx tsc -p packages/ui/tsconfig.json --noEmit` both pass with this wiring
in place, and `npm run build` produces a preload bundle that
`tools/guards/no-fs-in-preload.mjs` still confirms requires only
`"electron"`. There is no automated test coverage or built-artifact capture
of the Export tab yet — the inventory records this as "partial", not
"done", for that reason.
