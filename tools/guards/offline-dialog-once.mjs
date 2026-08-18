#!/usr/bin/env node
/**
 * Regression guard: the returning-player summary must open EXACTLY ONE dialog,
 * no matter how many times state$ pushes while it is still unacknowledged.
 *
 * The bug this exists to catch: `pendingOfflineSummary` stays truthy in the view
 * until the player clicks Close, and the tick loop pushes a new state every
 * second, so an unguarded subscriber opened a fresh dialog per tick. Measured in
 * the running app before the fix: 68 stacked `.mm-dialog` elements in under 90
 * seconds, with the player racing the tick loop to dismiss them. The explicit
 * getSnapshot() open that sat right below the subscribe() also meant the very
 * first mount always double-opened.
 *
 * This project has no test framework, so this follows the committed-script
 * pattern used by determinism-check and the other guards: run it, read the
 * verdict, non-zero exit means broken.
 *
 * It asserts on the SOURCE rather than a live DOM because mounting the real UI
 * needs a browser. That is a real limit and it is stated here rather than
 * implied away: this proves the guard conditions are present, not that a
 * rendered dialog stayed singular. The live count was verified by hand.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexPath = join(repoRoot, 'packages', 'ui', 'src', 'index.ts');
const dialogPath = join(repoRoot, 'packages', 'ui', 'src', 'panels', 'offline-summary.ts');

// Normalise line endings before scanning. A needle written with \n matches
// nothing on a CRLF checkout, and a guard that silently stops guarding is worse
// than no guard at all.
const norm = (s) => s.split(/\r\n|\n|\r/);

const failures = [];
const indexLines = norm(readFileSync(indexPath, 'utf8'));
const dialogLines = norm(readFileSync(dialogPath, 'utf8'));

// 1. The opener must hand back a handle, or the caller cannot tell whether one
//    is already on screen.
if (!dialogLines.some((l) => /^\s*export function openOfflineSummaryDialog\(.*\): OfflineSummaryDialogHandle \{/.test(l))) {
  failures.push('offline-summary.ts: openOfflineSummaryDialog must return an OfflineSummaryDialogHandle');
}
if (!dialogLines.some((l) => /^\s*return handle;/.test(l))) {
  failures.push('offline-summary.ts: openOfflineSummaryDialog must actually return its handle');
}

// 2. mountUi must hold the open dialog and bail out when one is already up.
if (!indexLines.some((l) => /^\s*let offlineDialog: OfflineSummaryDialogHandle \| null = null;/.test(l))) {
  failures.push('index.ts: mountUi must track the open dialog in a local handle');
}
if (!indexLines.some((l) => /^\s*if \(offlineDialog\) return;/.test(l))) {
  failures.push('index.ts: the open path must return early when a dialog is already open');
}

// 3. The redundant second open must stay gone. subscribe() delivers the current
//    value, so an explicit getSnapshot() open beside it is a guaranteed second
//    dialog on mount. Anchored to a line start so a commented-out call cannot
//    satisfy it.
const doubleOpen = indexLines.filter((l) =>
  /^\s*(?:\w+\s*=\s*)?openOfflineSummaryDialog\(/.test(l) &&
  /getSnapshot\(\)/.test(l),
);
if (doubleOpen.length > 0) {
  failures.push(`index.ts: found ${doubleOpen.length} getSnapshot()-driven open(s); subscribe() already delivers the current value`);
}

// 4. mountUi must call the opener exactly once, through the guarded path.
const directOpens = indexLines.filter((l) => /openOfflineSummaryDialog\(/.test(l) && !/^\s*(?:\/\/|\*)/.test(l) && !/^import/.test(l));
if (directOpens.length !== 1) {
  failures.push(`index.ts: expected exactly 1 call to openOfflineSummaryDialog, found ${directOpens.length}`);
}

if (failures.length > 0) {
  console.error('[offline-dialog-once] FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('[offline-dialog-once] OK: the summary opens once and only once per pending summary.');
