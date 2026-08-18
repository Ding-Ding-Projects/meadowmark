# Meadowmark handoff

Prepared on 2026-08-18 after normally integrating the six preserved
implementation tips, the documentation handoff, and the packaged capture
evidence onto the `dd2a44f` baseline. No commit was rebased or dropped.

This is a handoff-only closeout, not a release pass. It did not build an installer or
publish or verify a new release after integration. It did preserve a real
published-package first-paint capture for the existing `v0.1.0-22` baseline.

## Read this first

The latest published baseline is `v0.1.0-22`, targeting `dd2a44f`. The six
implementation tips are now combined on the integration candidate, and focused
source checks were rerun there. The combined candidate was not packaged,
installed, or exercised as one application.

The newest real built-application capture is
[`meadowmark-v0.1.0-22-packaged-fields.png`](docs/assets/captures/meadowmark-v0.1.0-22-packaged-fields.png),
with machine-readable provenance in the adjacent
[`capture.json`](docs/assets/captures/meadowmark-v0.1.0-22-packaged-fields.capture.json).
It was taken from the published `v0.1.0-22` package targeting `dd2a44f`; its
SHA-256 is
`a6d26eb630f52a3dc65b3bd15eae3d8d26160d0f6e9caaea14a90a698af14923`.
It proves package launch and first paint only. It does not prove the later
integration candidate, application interaction, settings persistence,
accessibility, narrow layouts, update behavior, or a complete capture matrix.

## Published baseline

- Release: [`v0.1.0-22`](https://github.com/Ding-Ding-Projects/meadowmark/releases/tag/v0.1.0-22),
  non-draft and non-prerelease, published 2026-08-18, targeting
  `dd2a44fa5264656a62802af04cac3bd192668b9d`.
- Workflow: [Release run 32159906150](https://github.com/Ding-Ding-Projects/meadowmark/actions/runs/32159906150),
  completed successfully for that exact commit. It built, packaged, and
  published; it ran no tests or lint.
- `Meadowmark-Setup-0.1.0.exe`: 135,972,352 bytes, published SHA-256
  `2e2fca4551649241917e06ba5007574f3c9f276ada0a21bb6a8e1d43019fc334`.
- `meadowmark-0.1.0-full.nupkg`: 135,257,825 bytes, published SHA-256
  `c1c22f9963c330ce64692b324db6d675f44c68b76ee39e3feaa22c8b9e88869d`.
- `RELEASES`: 81 bytes, published SHA-256
  `bec63b8ceaeaa1dab75caaf47457d2348ae22a31188bdf427ee0d2006b1bef17`.
- The published line-count report records 291 project files, 46,144 total
  project lines, and 42,285 non-blank project lines at `HEAD`, produced by
  `node tools/line-count/count.mjs --rev HEAD`.
- Its grand total is 374 files, 56,633 total lines, and 51,867 non-blank
  lines, including the separately reported excluded rows.
- These are the release's only three assets. It does not attach a dim-sum
  photo.
- Installers are deliberately unsigned. Windows may show an unknown-publisher
  or SmartScreen warning. Code signing remains prohibited for this project.

The successful release workflow proves that those three assets were produced
and published from `dd2a44f`. It is not interaction, visual, accessibility,
playability, update, rollback, or end-to-end service evidence.

## Integrated implementation lanes

Each source tip was merged normally with a dedicated integration commit:

| Lane | Source tip | Integration commit | State |
| --- | --- | --- | --- |
| Application runtime | [`809ee93`](https://github.com/Ding-Ding-Projects/meadowmark/commit/809ee9314c192f31bb55f9d306c88a7acf5c8d93) | `8825015` | Main-process services, bounded IPC/preload contract, updater metadata, and renderer response validation integrated. |
| Desktop UI | [`5e36e62`](https://github.com/Ding-Ding-Projects/meadowmark/commit/5e36e6223e8ed92f421fc4139b9075af5b3be8dc) | `6a626d8` | Nine-panel control centre and renderer-side capability consumers integrated. |
| Browser site | [`d25112a`](https://github.com/Ding-Ding-Projects/meadowmark/commit/d25112a0700691b65c4db11f6684acd0c0597f5e) | `ea1632f` | Browser-local capability surface integrated; release metadata was reconciled to `v0.1.0-22`. |
| Completeness inventory | [`007a65c`](https://github.com/Ding-Ding-Projects/meadowmark/commit/007a65c669b06e7912c69efed437e290bccd9556) | `bb9df2e` | 45-contract, 26-surface inventory and fail-closed checker integrated. |
| Release contract | [`f74f8ca`](https://github.com/Ding-Ding-Projects/meadowmark/commit/f74f8caa1c5d43352e56b9f7551836dc6a804640) | `e6179ca` | Deterministic icon and fail-closed unsigned publication contract integrated. |
| Documentation truth | [`287e62b`](https://github.com/Ding-Ding-Projects/meadowmark/commit/287e62bb4a640d88756909cedb741d3e91d92871) | `dad8dcb` | Community files, categorized feature articles, release history, and handoff integrated. |

The published `v0.1.0-22` commit predates these integration commits. No release
contains their combined result.

## Exact source-check record

These verdicts belong to their named commits and check source or metadata. They
do not prove the combined application or a packaged interaction.

| Commit | Command | Verdict and boundary |
| --- | --- | --- |
| `287e62b` | documentation structure scan | Exit 0: 26 feature articles each contained `Behaviour`, `Configuration`, `Failure modes`, `Security considerations`, `Verification`, and `Suggested articles`. This was a task-local PowerShell scan, not a committed product test. |
| `287e62b` | documentation local-link scan | Exit 0: 38 Markdown files had no missing local target. Task-local PowerShell scan. |
| `287e62b` | public-vocabulary scan | Exit 0: no private conversation term was found in the changed public documentation. Task-local PowerShell scan. |
| `287e62b` | `git diff --check` | Exit 0. |
| integrated candidate | `node site/tools/check-contract.mjs` | Exit 0: 24 exact surfaces, 14 runtime contracts, and verified published baseline `v0.1.0-22`. |
| `d25112a` | `Get-ChildItem site/js/*.js \| ForEach-Object { node --check $_.FullName }` | Exit 0 for all 16 JavaScript files. |
| `5e36e62` | `npm run typecheck --workspace @meadowmark/ui` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run build --workspace @meadowmark/shared` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run build --workspace @meadowmark/engine` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run typecheck --workspace @meadowmark/renderer` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npx --no-install tsx packages/ui/src/universal/contract-test.ts` | Exit 0 only loaded the module. `runUniversalContractTests()` is exported but has no caller, so this is not a contract verdict; wire and invoke the runner before treating it as a check. |
| `007a65c` | `node tools/line-count/self-test.mjs` | Exit 0. Categorization, newline arithmetic, mismatch failure, and invalid-revision failure passed. |
| integrated candidate | `node tools/inventory/check.mjs` | Exit 1 by design: release blocked by 1,145 `missing`, 25 `partial`, and 0 `done` rows. Endpoint discovery and registration are aligned after site integration. |
| `007a65c` | `node tools/inventory/negative-regression.mjs` | Exit 0 in the independent handoff review: all 10,647 deliberate removals or mutations turned red, and exact restoration turned green. |
| `f74f8ca` | `node tools/release/verify-contract.mjs` | Exit 0. Publication remains fail-closed until capture and built-artifact evidence is recorded. |
| `f74f8ca` | `node tools/release/verify-icon.mjs` | Exit 0. The committed ICO contains 16, 20, 24, 32, 40, 48, 64, 128, and 256 pixel frames. |
| `809ee93` | `npm run typecheck --workspace @meadowmark/app` | Exit 0 in the exact runtime checkout. No package build followed the handoff pivot. |
| `809ee93` | `git diff --check` | Exit 0. |
| integrated candidate | `npm run check:runtime-contract` | Exit 0 after its deliberate first run turned red on renderer/runtime payload drift. It now checks exact namespace keys and every runtime method consumed by the universal UI. |
| integrated candidate | UI and renderer typechecks | Exit 0 for `@meadowmark/ui` and `@meadowmark/renderer` after the history DTO repair. |
| all six lane diffs | public-vocabulary scan | Exit 0 across the documentation, site, UI, inventory, release, and runtime changed files. |
| `dd2a44f` | Release workflow run `32159906150` | Success for build, unsigned Squirrel packaging, and publication only. It ran no tests, lint, UI interaction, or captures. |

No full integrated test suite was run. No package or installer was built after
the handoff pivot. The source checks above must not be summarized as a passing
application, runtime, or release verification result.

## Completeness inventory and release gate

The inventory at `007a65c` defines 45 canonical contracts across 26 registered
surfaces, producing 1,170 contract/surface rows:

| Status | Rows |
| --- | ---: |
| `missing` | 1,145 |
| `partial` | 25 |
| `done` | 0 |

The inventory checker is intentionally red. Endpoint discovery and registration
are structurally aligned; the 1,170 incomplete status rows are the substantive
release boundary.

The integrated candidate carries the hardened release gate with
`rendersVerified: false` and null `sourceCommit`, `manifestPath`, and
`manifestSha256` fields. It is not authorized to publish. The false gate is
correct: no final-candidate capture manifest or built-artifact interaction proof
exists.

## Source checks versus built-artifact interaction

Source checks answer whether TypeScript compiles, source contracts are internally
consistent, inventory omissions are detected, links resolve, and release metadata
is fail-closed. They do not answer whether a control can be operated in the
packaged application.

Built-artifact interaction means launching the packaged executable and exercising
the exact path through the real main process, preload bridge, renderer, UI, and
persistent stores. No integrated lane has that proof. The repository has the
narrow `v0.1.0-22` packaged first-paint capture described above; it does not show
a completed player action and is therefore visual launch evidence, not
interaction evidence.

## Known unimplemented and unproved seams

### Integration and evidence

- The site, desktop UI, inventory, release, runtime, documentation, and capture
  evidence tips are integrated on the local candidate.
- Combined app, UI, and renderer typechecks plus site, release, icon,
  line-counter, and runtime-contract source checks passed. No combined package,
  installer, install, launch, or interaction pass exists for the candidate.
- No final-candidate capture manifest exists. Required destination, settings,
  editor, dialog, empty/error, narrow, light, dark, and contrast states remain
  uncaptured.
- Playability is unproved. No plant/harvest, production, delivery, building,
  animal, mine, museum, achievement, or village action has been exercised from
  a packaged application.

### Desktop service and UI seams

- The runtime exposes broad settings, schedules, logo, converter, exports,
  Ollama, narrator, authenticator, locks, history, updater, and status APIs in
  source. The UI consumes a checked subset, but their combined
  IPC/preload/renderer/UI behavior is not exercised in a packaged artifact.
- Shared School-mode watching and unlock, scheduled-value persistence mapping,
  logo host round-trip, narrator host persistence, guided authenticator and lock
  registration, Support Tickets, bundled documentation and changelog browsing,
  concrete export sources, and Ollama harness/chat flows remain incomplete.
- Advanced tab management and Word-depth appearance editing remain incomplete.
- Validated HTTPS and Home Assistant scheduled-setting sources explicitly remain
  unavailable in source; local scheduled values are the only implemented route.

### Browser-site boundaries

- Browser QR generation, operating-system credential-vault storage, native file
  and process authority, complete PDF/media/archive conversion, complete Ollama
  management, durable unlimited queues, and server delivery are not implemented.
- The verified dim-sum photo/startup surprise is still absent.
- The committed site contract and release data identify the verified
  `v0.1.0-22` baseline with exact published asset sizes and SHA-256 digests.
- The live site root responds, but `/capabilities.html` returns 404 and the live
  `data/release.json` still reports `published: false`, with null `tag` and
  `assetUrl`. The site lane is neither integrated nor deployed.

### Gameplay and renderer seams

- Renderer placement has no ground-tile raycast, and camera focus/highlight
  operations have no matching engine capability.
- Several world assets still use explicit fallbacks: farmers market, zoo gate,
  flower bed, gazebo, topiary, and some zoo enclosures.
- Plots and factories do not carry authoritative world positions; placement and
  some rendered layouts remain hard-coded. Terrain/weather simulation is absent.
- The UI does not fully represent multi-wagon train or multi-order helicopter
  state. Order cash/expiry, building selection, zoo species and collection,
  museum systems, per-task daily claims, richer offline earnings, and villager
  metadata remain incomplete or absent.
- Factory-job cancellation, manual vehicle departure, building demolition and
  rotation, animal feed/collection, zoo collection, and museum donation lack
  complete simulation/action support. Some reward tables and daily/regatta
  content are also absent.

### Release and installation seams

- `rendersVerified` remains false, so the hardened release path is correctly
  blocked.
- The icon and release-contract source checks passed, but no installer was built
  from `f74f8ca` and no packaged executable or installer icon was inspected.
- The hardened workflow requires a new committed semantic package version, but
  the integrated candidate still declares `0.1.0`, a version already used by
  `v0.1.0-22` and earlier releases. Publication must remain blocked until an
  authorized release task commits a unique version.
- Update availability, download, restart, rollback, repair, invalid metadata,
  corrupt package, cancellation, offline behavior, and unsaved-work protection
  remain unexercised.
- `v0.1.0-22` does not contain any of the integrated lane tips. No release
  contains their combined work, and this handoff did not create or verify
  another release.

## Open issues

- [`Ding-Ding-Projects/meadowmark#2`](https://github.com/Ding-Ding-Projects/meadowmark/issues/2),
  **Release-grade completion and repository shutdown**, is open. Its sole comment
  records the work start and the `c328d7d` baseline; it does not contain a final
  integrated handoff comment. That public comment also exposes an absolute local
  checkout path. This handoff lane was explicitly read-only for GitHub, so it did
  not edit the comment; the next authorized GitHub-record pass should remove the
  path and verify the edited comment.
No issue was edited or closed during this handoff lane. A separate issue in a
private instruction repository was also reviewed and is reported privately; its
repository name and link are intentionally omitted here.

## Next owner and action

The implementation lanes are integrated. The next release-grade owner should:

1. Commit a new semantic application version; `0.1.0` is already published and
   the hardened release workflow correctly refuses its reuse.
2. Repair the unsigned executable/icon resource path. PE resource editing is
   disabled while installer verification requires the committed icon family.
3. Build through `build.bat /s` and `build-installer.bat /s`, then verify the
   generated Squirrel assets against the exact candidate commit.
4. Exercise real packaged player and service interactions, wire the remaining UI
   authority seams, and capture the required surface matrix through the approved
   hidden-desktop route.
5. Populate only evidence that actually exists, rerun the fail-closed inventory
   and release checks, and set `rendersVerified` only for a matching committed
   manifest.
6. Keep Meadowmark issue #2 open until the release-grade objective and its
   evidence are complete.

Until those steps complete, the honest state is: the implementation lanes are
integrated, the published baseline remains `v0.1.0-22`, the hardened release gate
is false, zero inventory rows are complete, and the integrated candidate has no
package or runtime interaction verdict.
