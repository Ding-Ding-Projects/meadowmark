#!/usr/bin/env node
/**
 * Negative regression for tools/inventory/check.mjs.
 *
 * A guard nobody has watched fail proves nothing. This script:
 *   1. Takes the first row of docs/inventory/inventory.json, flips its
 *      status to "done" and points its implementation at a file that does
 *      not exist.
 *   2. Runs check.mjs against that mutated copy and asserts it exits
 *      non-zero (red).
 *   3. Restores the original file exactly, regardless of outcome.
 *
 * If check.mjs ever stops catching this, this script exits non-zero and
 * says so — that is the signal that the completeness guard has silently
 * stopped guarding anything.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const inventoryPath = join(repoRoot, 'docs', 'inventory', 'inventory.json');
const checkScript = join(repoRoot, 'tools', 'inventory', 'check.mjs');
const backupPath = `${inventoryPath}.negative-regression-backup`;

function run() {
  const original = readFileSync(inventoryPath, 'utf8');
  copyFileSync(inventoryPath, backupPath);

  try {
    const inventory = JSON.parse(original);
    if (!Array.isArray(inventory.features) || inventory.features.length === 0) {
      console.error('[negative-regression] inventory.json has no features to mutate.');
      return 1;
    }

    const bogusPath = 'packages/app/src/this-file-does-not-exist.ts';
    const mutated = structuredClone(inventory);
    mutated.features[0] = {
      ...mutated.features[0],
      status: 'done',
      implementation: bogusPath,
    };

    writeFileSync(inventoryPath, JSON.stringify(mutated, null, 2), 'utf8');

    let redAsExpected = false;
    try {
      execFileSync('node', [checkScript], { cwd: repoRoot, stdio: 'pipe' });
      // If it did NOT throw, check.mjs exited 0 on a mutated file claiming
      // "done" for a file that doesn't exist. That is exactly the failure
      // this regression exists to catch.
      redAsExpected = false;
    } catch (err) {
      // execFileSync throws when the child exits non-zero -- that's the
      // red result we want to see.
      redAsExpected = typeof err.status === 'number' && err.status !== 0;
    }

    if (!redAsExpected) {
      console.error(
        '[negative-regression] FAILED: check.mjs did not go red for a "done" row pointing at a ' +
          'nonexistent implementation file. The completeness guard has stopped guarding anything.',
      );
      return 1;
    }

    console.log('[negative-regression] OK: check.mjs correctly went red for a fabricated "done" row.');
    return 0;
  } finally {
    // Restore, no matter what happened above.
    writeFileSync(inventoryPath, original, 'utf8');
    try {
      unlinkSync(backupPath);
    } catch {
      // best-effort cleanup of the backup copy
    }
  }
}

process.exitCode = run();
