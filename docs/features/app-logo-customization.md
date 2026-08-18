# App-logo customization

## Behaviour

The app ships several presets plus a local custom-image upload path,
implemented by `packages/app/src/services/logo`. The pipeline is
decode -> edit -> convert -> verify -> persist, and the whole thing is
fail-closed: `applyPresetSelection` and `applyCustomSelection` either
succeed completely (the new logo is active and every derived asset is
written) or throw and leave whatever was active before completely
unchanged — there is no partial or broken intermediate state.

The "Logo" tab in Settings (`packages/ui/src/logo/index.ts`) shows the
currently active selection (default / preset / custom) with a live preview,
a grid of the shipped presets (each rendered to a real PNG preview, not a
placeholder), an upload action, and a reset-to-default action.

Custom upload is PNG-only for this pass: the panel opens the platform's
native file picker (`dialog.showOpenDialog`, run in the main process),
reads the chosen file's bytes, and applies it with a fixed default edit
(`fit: 'contain'`, transparent background) — the full crop/focal-point
editor `LogoEditParams` supports is not yet wired into the UI. Decoding
rejects anything that is not a well-formed PNG; a malformed or oversized
upload throws and the active logo is untouched.

## Wiring

- `packages/app/src/ipc-channels.ts` — `logo:list-presets`,
  `logo:get-manifest`, `logo:preview-preset`, `logo:preview-current`,
  `logo:apply-preset`, `logo:pick-and-apply-custom`, `logo:reset`.
- `packages/app/src/ipc.ts` — drives the native open dialog for custom
  uploads, calls into `services/logo`'s manager, and encodes preview
  bitmaps to PNG data URLs (`encodePng`, re-exported from
  `services/logo/manager.ts`) so the renderer can show a preview without
  the renderer ever touching raw pixels or the filesystem.
- `packages/app/src/preload.ts` — exposes `window.meadowmark.logo`, with
  only type-only imports from the logo service, so the sandboxed preload
  bundle stays free of `node:fs`.
- `packages/ui/src/logo/bridge.ts` — the renderer-side bridge, typed
  loosely against `window.meadowmark.logo`, following the same pattern as
  `history/bridge.ts` and `exports/bridge.ts`.
- `packages/ui/src/logo/index.ts` — the panel itself, mounted as a
  Settings tab in `packages/ui/src/settings/index.ts`.

Every successful preset or custom selection also drops a labeled snapshot
into local version history (`logo/manifest.json`), the same way a save,
settings change, or export does.

## Failure modes

- Running outside the Electron host has no logo bridge; the panel shows an
  honest "only available in the installed app" message.
- Canceling the file picker reports "Upload canceled" rather than a silent
  no-op or an error.
- A decode/convert failure (malformed PNG, oversized image) is caught and
  shown with the real error text.

## Security considerations

All decoding, editing, and conversion happens locally in the main process;
nothing is ever uploaded anywhere. The pipeline never rewrites package
identity, application ID, executable filename, or any other stable
installed identity — it changes presentation only (see `manager.ts`'s
header comment).

## Verification

`npx tsc -p packages/app/tsconfig.json --noEmit` and
`npx tsc -p packages/ui/tsconfig.json --noEmit` both pass with this wiring
in place, and `npm run build` produces a preload bundle that
`tools/guards/no-fs-in-preload.mjs` still confirms requires only
`"electron"`. There is no automated test coverage or built-artifact
capture of the Logo tab yet, the crop/focal-point editor is not wired into
the UI, and upload only accepts PNG — the inventory records this as
"partial", not "done", for those reasons.
