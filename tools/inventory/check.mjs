#!/usr/bin/env node
/**
 * Completeness inventory checker.
 *
 * Reads docs/inventory/inventory.json (a HAND-WRITTEN list — see the notes
 * in that file for why it must never be generated) and prints a summary
 * table.
 *
 * This script fails (non-zero exit) ONLY when a row claims status "done"
 * but the file named in its `implementation` field does not exist. It
 * deliberately does NOT fail for "missing" or "partial" rows: at this
 * point in the project almost every row is "missing", and that is honest,
 * not a defect. What must never happen is a row that claims "done" while
 * pointing at nothing — that would be the inventory silently going stale,
 * which is worse than the inventory saying "not built yet".
 *
 * See tools/inventory/negative-regression.mjs for the guard that proves
 * this actually fires: it flips a row to "done" with a bogus path, checks
 * that this script goes red, then restores the file. A check nobody has
 * watched fail proves nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const inventoryPath = join(repoRoot, 'docs', 'inventory', 'inventory.json');

function main() {
  if (!existsSync(inventoryPath)) {
    console.error(`[inventory] Missing ${inventoryPath}`);
    return 1;
  }

  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  } catch (err) {
    console.error(`[inventory] Could not parse ${inventoryPath}: ${err.message}`);
    return 1;
  }

  const features = Array.isArray(inventory.features) ? inventory.features : [];
  if (features.length === 0) {
    console.error('[inventory] inventory.json has no features listed. That is almost certainly wrong.');
    return 1;
  }

  const counts = { done: 0, partial: 0, missing: 0 };
  const violations = [];

  console.log('# Meadowmark completeness inventory\n');
  console.log('| Feature | Surface | Status | Implementation |');
  console.log('| --- | --- | --- | --- |');

  for (const feature of features) {
    const { id, title, surface, status, implementation } = feature;

    if (!id || !title || !status) {
      violations.push(`Row missing required field(s) (id/title/status): ${JSON.stringify(feature)}`);
      continue;
    }

    if (status === 'done' || status === 'partial' || status === 'missing') {
      counts[status] += 1;
    } else {
      violations.push(`${id}: unrecognized status "${status}" (expected done|partial|missing)`);
    }

    if (status === 'done') {
      if (!implementation) {
        violations.push(`${id}: status is "done" but implementation is not set`);
      } else {
        const implPath = join(repoRoot, implementation);
        if (!existsSync(implPath)) {
          violations.push(
            `${id}: status is "done" but implementation "${implementation}" does not exist on disk`,
          );
        }
      }
    }

    console.log(`| ${title} | ${surface ?? ''} | ${status} | ${implementation ?? '_none_'} |`);
  }

  console.log('');
  console.log('## Summary\n');
  console.log(`- done: ${counts.done}`);
  console.log(`- partial: ${counts.partial}`);
  console.log(`- missing: ${counts.missing}`);
  console.log(`- total: ${features.length}`);
  console.log('');

  if (violations.length > 0) {
    console.error('[inventory] FAILED. A row claims completeness it cannot back up:\n');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    return 1;
  }

  console.log('[inventory] OK: every "done" row points at a real implementation file.');
  return 0;
}

process.exitCode = main();
