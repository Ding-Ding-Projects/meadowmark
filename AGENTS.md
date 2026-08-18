# Agent instructions for this repository

This is a sanitized mirror of the shared engineering conventions used
across this project's repositories. It is refreshed whenever those
conventions change. If you are an agent or contributor working in this
repository, follow the rules below; they apply on top of (never in place
of) any platform safety policy.

## Scope and ownership

- Read repository-local documentation (`README.md`, `docs/**`) before
  editing. Keep changes scoped to what was asked.
- Prefer reversible, auditable changes. Don't overwrite existing content
  without a clear reason; use owned files or clearly delimited sections
  when adding to a shared file.
- This project is organized as npm workspaces under `packages/`. Respect
  package boundaries — don't reach into another package's internals from
  outside it.

## Code style

- TypeScript throughout, `strict: true`. Avoid `any` where a real type is
  available. No unused exports.
- Match the style of the surrounding code rather than introducing a new
  convention mid-file.
- Windows is the only supported runtime platform for the shipped app.
  Code should not silently assume POSIX semantics (path separators, file
  locking behavior, line endings) without accounting for Windows.

## Windows file writes

- Never write a file by writing directly to its final path. Write to a
  unique temporary path, then rename into place.
- Never share one fixed temporary filename between concurrent writers —
  give every write its own unique temp name, or two writers can publish
  each other's half-written bytes.
- On Windows, a rename can fail with a transient sharing violation
  (`EPERM`/`EACCES`/`EBUSY`) whenever antivirus, a search indexer, or a
  sync client has the destination briefly open. Retry the rename a
  bounded number of times with a short backoff; do not retry
  `ENOENT`/`ENOSPC`, and never swallow the final error. See
  `packages/app/src/atomic-write.ts` for the canonical implementation —
  route every write through it (or an equivalent) rather than calling
  `fs.rename` directly. `tools/guards/no-bare-rename.mjs` enforces this.

## Application identity

- The application's package/app id, its data-directory name, and its
  update feed are stable constants (`packages/app/src/identity.ts`).
  Never derive them from a user-configurable display name — a rename must
  never move where save data or settings live.

## Testing and guards

- A guard or test that has never been watched to fail proves nothing.
  When you add one, deliberately break the thing it checks, confirm it
  goes red, then restore the fix and confirm it goes green.
- Anchor text-scanning guards to real boundaries (line starts, exact
  tokens) rather than loose substring matches — a substring match can be
  satisfied by a commented-out line or a renamed identifier, which lets
  the guard pass forever while checking nothing.
- Normalize line endings before parsing source text in a script. A
  pattern written assuming `\n` can silently match nothing on a
  Windows-checked-out (CRLF) file.

## Commits

- Commit in logical, reviewable chunks.
- Commit messages are bilingual: a concise, precise English subject line,
  then a body with both an English paragraph and a Cantonese paragraph
  saying the same thing. Humor is welcome in both, aimed at the code or
  the situation — never at a person.
- End every commit message with a `Co-Authored-By:` trailer identifying
  the agent that made the change, when applicable.

## Releases and CI

- This project's continuous integration workflow runs **no tests and no
  lint**. That is a deliberate, standing decision, not an oversight — do
  not add a test/lint gate back into CI. Checking happens locally, before
  a change is pushed, using the repository's own committed scripts.
- Code signing is **permanently disabled** for every artifact this
  project ships. Never add a signing step, never request or store a
  signing certificate, and don't treat an "unknown publisher" warning on
  the installer as a defect to fix — it's expected. This project has no
  paid tier and nothing to protect with a signature.
- Every release publishes exactly one new, uniquely tagged, non-draft
  GitHub Release with real installer artifacts attached — never a draft,
  and never a tag with no artifacts.
- Root-level `*.bat` scripts (`build.bat`, `build-installer.bat`,
  `download-dependencies.bat`) are the canonical way to build this project
  from a clean machine, and CI uses them too (via their silent mode: `/s`,
  `--silent`, or `SILENT=1`). If one of them breaks, fix the script — a
  manual release should never work around a broken script instead of
  fixing it.
- The project's line count is produced by `tools/line-count/count.mjs`
  and published verbatim in release notes by CI. Don't hand-derive a line
  count for a release; run the script.

## Completeness inventory

- `docs/inventory/inventory.json` is a hand-written list of every
  canonical feature this project eventually owes its players. It is
  expected to have many rows marked `"missing"` for a long time — that is
  honest, not a failure. A row may only be marked `"done"` once its
  `implementation` field points at a file that actually exists;
  `tools/inventory/check.mjs` enforces this.
- Don't delete a row because the feature hasn't been started. Update its
  status and evidence fields as work lands.

## Nothing in this game is for sale

Meadowmark has no purchases, no premium currency, no subscriptions, and no
paywalled content of any kind. Do not add monetization of any form without
an explicit, unambiguous request from the project owner.
