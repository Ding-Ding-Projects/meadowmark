# Meadowmark handoff

Prepared on 2026-08-18 after fetching `origin/main` at
`dd2a44fa5264656a62802af04cac3bd192668b9d` and merging it normally into the
documentation branch. The resulting handoff commit preserves documentation tip
`287e62bb4a640d88756909cedb741d3e91d92871` and `dd2a44f` as its two parents. No
commit was rebased or dropped.

This is a handoff-only closeout. It did not build an installer, publish or verify
a new release, capture the application, integrate the preserved implementation
branches into `main`, or delete repository state.

## Read this first

The latest published baseline is `v0.1.0-22`, targeting `dd2a44f`. Six substantial
lanes are preserved in separate branches, but none of their tips is an ancestor
of that published commit. Source checks passed in several individual lanes; the
lanes have not been combined, built, or exercised as one application.

The only real built-application capture remains
[`meadowmark-packaged-terrain-fields.png`](docs/assets/captures/meadowmark-packaged-terrain-fields.png)
from commit [`c328d7d`](https://github.com/Ding-Ding-Projects/meadowmark/commit/c328d7d3552aa46f22766de9d5bf763cdfe15bc1).
It shows launch and first paint after the welcome modal was dismissed: baseline
terrain, field beds, the navigation rail, HUD, and the Fields empty state. Its
SHA-256 is
`a22908afd6b002b973535c8a18c1d915f04b6268ed4a6b2284734a87283b7d2a`.
It does not prove `dd2a44f`, any preserved lane tip, application interaction,
settings persistence, accessibility, narrow layouts, update behavior, or a
complete capture matrix.

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

## Preserved implementation lanes

Each commit exists locally and on the listed pushed branch. `git merge-base
--is-ancestor <tip> dd2a44f` returned false for every tip below, so none is part
of the published baseline.

| Lane | Local branch / pushed branch | Preserved tip | State |
| --- | --- | --- | --- |
| Documentation truth | `agent/yumtong-docs-truth` / `origin/agent/release-docs-truth` | [`287e62b`](https://github.com/Ding-Ding-Projects/meadowmark/commit/287e62bb4a640d88756909cedb741d3e91d92871) | Public documentation, community files, categorized feature articles, and release-history corrections; merged with `dd2a44f` only in this local branch. |
| Browser site | `agent/yumtong-site-universal` / `origin/agent/site-capabilities` | [`d25112a`](https://github.com/Ding-Ding-Projects/meadowmark/commit/d25112a0700691b65c4db11f6684acd0c0597f5e) | Browser-local capability surface and contract check; still records `v0.1.0-21` and must be reconciled with `v0.1.0-22`. |
| Desktop UI | `agent/yumtong-ui-universal` / `origin/agent/desktop-control-centre` | [`5e36e62`](https://github.com/Ding-Ding-Projects/meadowmark/commit/5e36e6223e8ed92f421fc4139b9075af5b3be8dc) | Universal control centre and UI-side bridge consumers; source-checked only. |
| Completeness inventory | `agent/yumtong-inventory-guards` / `origin/agent/inventory-contract` | [`007a65c`](https://github.com/Ding-Ding-Projects/meadowmark/commit/007a65c669b06e7912c69efed437e290bccd9556) | Per-surface canonical inventory, schema, fail-closed checker, negative matrix, and line-counter self-test. |
| Release contract | `agent/yumtong-release-contract` / `origin/agent/release-hardening` | [`f74f8ca`](https://github.com/Ding-Ding-Projects/meadowmark/commit/f74f8caa1c5d43352e56b9f7551836dc6a804640) | Unsigned Windows packaging contract, deterministic icon family, and fail-closed publication workflow; its stricter release gate remains false. |
| Application runtime | `agent/yumtong-app-runtime` / `origin/agent/runtime-seam` | [`809ee93`](https://github.com/Ding-Ding-Projects/meadowmark/commit/809ee9314c192f31bb55f9d306c88a7acf5c8d93) | Main-process runtime services, bounded IPC/preload contract, updater metadata, and renderer response validation; type-checked only. |

The primary checkout was still at `6e7760b` when the linked checkout inventory was
read. The next owner should update it normally from `origin/main` before using it
as the integration checkout.

## Exact source-check record

These verdicts belong to their named commits and check source or metadata. They
do not prove the combined application or a packaged interaction.

| Commit | Command | Verdict and boundary |
| --- | --- | --- |
| `287e62b` | documentation structure scan | Exit 0: 26 feature articles each contained `Behaviour`, `Configuration`, `Failure modes`, `Security considerations`, `Verification`, and `Suggested articles`. This was a task-local PowerShell scan, not a committed product test. |
| `287e62b` | documentation local-link scan | Exit 0: 38 Markdown files had no missing local target. Task-local PowerShell scan. |
| `287e62b` | public-vocabulary scan | Exit 0: no private conversation term was found in the changed public documentation. Task-local PowerShell scan. |
| `287e62b` | `git diff --check` | Exit 0. |
| `d25112a` | `node site/tools/check-contract.mjs` | Exit 0: 24 exact surfaces and 14 runtime contracts. The check still names historical release `v0.1.0-21`, so it must be updated and rerun after integration. |
| `d25112a` | `Get-ChildItem site/js/*.js \| ForEach-Object { node --check $_.FullName }` | Exit 0 for all 16 JavaScript files. |
| `5e36e62` | `npm run typecheck --workspace @meadowmark/ui` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run build --workspace @meadowmark/shared` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run build --workspace @meadowmark/engine` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npm run typecheck --workspace @meadowmark/renderer` | Exit 0 in the exact UI checkout. |
| `5e36e62` | `npx --no-install tsx packages/ui/src/universal/contract-test.ts` | Exit 0 only loaded the module. `runUniversalContractTests()` is exported but has no caller, so this is not a contract verdict; wire and invoke the runner before treating it as a check. |
| `007a65c` | `node tools/line-count/self-test.mjs` | Exit 0. Categorization, newline arithmetic, mismatch failure, and invalid-revision failure passed. |
| `007a65c` | `node tools/inventory/check.mjs` | Exit 1 by design: release blocked. It reported one isolated endpoint-drift violation because `site/capabilities.html` is absent until the site lane integrates, plus 1,145 `missing`, 25 `partial`, and 0 `done` rows. |
| `007a65c` | `node tools/inventory/negative-regression.mjs` | Exit 0 in the independent handoff review: all 10,647 deliberate removals or mutations turned red, and exact restoration turned green. |
| `f74f8ca` | `node tools/release/verify-contract.mjs` | Exit 0. Publication remains fail-closed until capture and built-artifact evidence is recorded. |
| `f74f8ca` | `node tools/release/verify-icon.mjs` | Exit 0. The committed ICO contains 16, 20, 24, 32, 40, 48, 64, 128, and 256 pixel frames. |
| `809ee93` | `npm run typecheck --workspace @meadowmark/app` | Exit 0 in the exact runtime checkout. No package build followed the handoff pivot. |
| `809ee93` | `git diff --check` | Exit 0. |
| all six lane diffs | public-vocabulary scan | Exit 0 across the documentation, site, UI, inventory, release, and runtime changed files. |
| `dd2a44f` | Release workflow run `32159906150` | Success for build, unsigned Squirrel packaging, and publication only. It ran no tests, lint, UI interaction, or captures. |

No full integrated test suite was run because the six lane tips are still
separate. No package or installer was built after the handoff pivot. The source
checks above must not be summarized as a passing application, runtime, or release
verification result.

## Completeness inventory and release gate

The inventory at `007a65c` defines 45 canonical contracts across 26 registered
surfaces, producing 1,170 contract/surface rows:

| Status | Rows |
| --- | ---: |
| `missing` | 1,145 |
| `partial` | 25 |
| `done` | 0 |

The inventory checker is intentionally red. Its one structural violation is the
site endpoint that will exist only after `d25112a` integrates; the 1,170 status
rows remain the substantive release boundary even after that drift is resolved.

The published `dd2a44f` baseline still carries the older one-field gate
`{"rendersVerified": true}`. The replacement gate at `f74f8ca` has
`rendersVerified: false` and null `sourceCommit`, `manifestPath`, and
`manifestSha256` fields. Therefore the hardened release contract is not
authorized to publish a candidate after it integrates. The stricter false gate
is correct: no final-candidate capture manifest or built-artifact interaction
proof exists. Do not describe the stricter gate as current `main` state before
`f74f8ca` is integrated.

## Source checks versus built-artifact interaction

Source checks answer whether TypeScript compiles, source contracts are internally
consistent, inventory omissions are detected, links resolve, and release metadata
is fail-closed. They do not answer whether a control can be operated in the
packaged application.

Built-artifact interaction means launching the packaged executable and exercising
the exact path through the real main process, preload bridge, renderer, UI, and
persistent stores. No preserved lane has that proof. The repository has only the
narrow `c328d7d` packaged first-paint capture described above; it does not show a
completed player action and is therefore visual launch evidence, not interaction
evidence.

## Known unimplemented and unproved seams

### Integration and evidence

- The site, desktop UI, inventory, release, and runtime lane tips have not been
  integrated with each other or with `origin/main`.
- No combined typecheck, build, contract run, installer build, install, launch,
  or interaction pass exists for the integrated candidate.
- No final-candidate capture manifest exists. Required destination, settings,
  editor, dialog, empty/error, narrow, light, dark, and contrast states remain
  uncaptured.
- Playability is unproved. No plant/harvest, production, delivery, building,
  animal, mine, museum, achievement, or village action has been exercised from
  a packaged application.

### Desktop service and UI seams

- The runtime lane exposes broad settings, schedules, logo, converter, exports,
  Ollama, narrator, authenticator, locks, history, updater, and status APIs in
  source. The UI lane is separate, so their combined IPC/preload/renderer/UI
  behavior is not integrated or exercised.
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
- The site contract still identifies `v0.1.0-21`; release data and assertions must
  move to `v0.1.0-22` during integration.
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

- `rendersVerified` remains false, so the hardened release lane is correctly
  blocked.
- The icon and release-contract source checks passed, but no installer was built
  from `f74f8ca` and no packaged executable or installer icon was inspected.
- The hardened workflow requires a new committed semantic package version, but
  both `origin/main` and `f74f8ca` still declare `0.1.0`, a version already used
  by `v0.1.0-22` and earlier releases. After `f74f8ca` integrates, publication
  must remain blocked until an authorized release task commits a unique version.
- Update availability, download, restart, rollback, repair, invalid metadata,
  corrupt package, cancellation, offline behavior, and unsaved-work protection
  remain unexercised.
- `v0.1.0-22` does not contain any of the six preserved lane tips. No release
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

The next owner should use a current `main` checkout and integrate the six preserved
tips semantically, resolving their shared changes rather than taking one side of a
conflict. Recommended order:

1. Integrate runtime `809ee93`, then UI `5e36e62`, and reconcile the shared bridge
   types and host methods.
2. Integrate site `d25112a`; update its verified historical release data from
   `v0.1.0-21` to `v0.1.0-22` without converting source checks into runtime claims.
3. Integrate documentation `287e62b`, preserving the current release and lane
   evidence in this handoff.
4. Integrate inventory `007a65c`; resolve the site endpoint drift, rerun the
   checker, and keep the release blocked for every incomplete row.
5. Integrate release contract `f74f8ca`; keep `rendersVerified: false` until a
   final candidate is built, installed, interacted with, and captured through the
   approved headless route with a committed manifest.
6. Run every source check above against the combined commit, then build through
   `build.bat /s` and `build-installer.bat /s`. Treat those as build/package
   evidence only.
7. Exercise real packaged player and service interactions, capture the required
   surface matrix, populate only evidence that actually exists, and rerun the
   fail-closed inventory and release checks.
8. Post the integrated handoff to Meadowmark issue #2. Do not close it until the
   integrated commit, packaged interaction, release evidence, and remaining
   completion criteria are genuinely verified.

Until those steps complete, the honest state is: published baseline available,
six implementation lanes preserved, the hardened lane's release gate false,
zero complete inventory rows, and no release-grade integrated candidate.
