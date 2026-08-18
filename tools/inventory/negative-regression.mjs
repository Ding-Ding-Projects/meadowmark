#!/usr/bin/env node
/** Exhaustive in-memory red/green regression matrix for the inventory guard. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_CONTRACTS,
  CANONICAL_SURFACES,
  EVIDENCE_FIELDS,
  INVENTORY_SCHEMA_VERSION,
} from './canonical.mjs';
import { validateInventoryDocument } from './check.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const schema = JSON.parse(readFileSync(join(repoRoot, 'docs', 'inventory', 'inventory.schema.json'), 'utf8'));
const FIELD_FIXTURES = Object.freeze({
  implementation: 'packages/ui/src/index.ts',
  article: 'docs/features/i18n.md',
  localization: 'packages/ui/src/i18n/index.ts',
  tests: 'tools/guards/no-bare-rename.mjs',
  persistence: 'packages/ui/src/settings/store.ts',
  bundledArtifactProof: 'packages/app/build.mjs',
  builtArtifactInteraction: 'tools/inventory/fixtures/built-artifact-interaction.json',
  capture: 'docs/assets/captures/meadowmark-packaged-terrain-fields.png',
});

function completeFixture() {
  return {
    $schema: './inventory.schema.json',
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    notes: ['Synthetic complete fixture used only in memory by the negative-regression matrix.'],
    contracts: CANONICAL_CONTRACTS.map(({ id, title }) => ({ id, title })),
    surfaces: CANONICAL_SURFACES.map(({ id, kind, endpoint, title }) => ({ id, kind, endpoint, title })),
    surfaceRecords: CANONICAL_SURFACES.map((surface) => ({
      surfaceId: surface.id,
      contracts: CANONICAL_CONTRACTS.map((contract) => ({
        contractId: contract.id,
        status: 'done',
        ...Object.fromEntries(EVIDENCE_FIELDS.map((field) => [field, [FIELD_FIXTURES[field]]])),
      })),
    })),
  };
}

function validateFixture(inventory, paths = false) {
  return validateInventoryDocument({
    inventory,
    schema,
    root: repoRoot,
    requireComplete: true,
    verifyRepositoryPaths: paths,
    verifyDiscoveredEndpoints: false,
    failFast: true,
  });
}

function assertGreen(inventory, label) {
  const result = validateFixture(inventory, false);
  assert.deepEqual(result.violations, [], `${label}: expected no structural violations`);
  assert.deepEqual(result.incomplete, [], `${label}: expected no incomplete rows`);
}

function assertRed(inventory, label, expected, paths = false) {
  const result = validateFixture(inventory, paths);
  const evidence = [...result.violations, ...result.incomplete].join('\n');
  assert.ok(result.violations.length || result.incomplete.length, `${label}: unexpectedly stayed green`);
  if (expected) assert.match(evidence, expected, `${label}: red result did not identify the intended boundary`);
}

const baseline = completeFixture();
const baselineBytes = JSON.stringify(baseline);
assertGreen(baseline, 'baseline');
let red = 0;

function exercise(label, apply, restore, expected, paths = false) {
  apply();
  assertRed(baseline, label, expected, paths);
  red += 1;
  restore();
}

for (let index = 0; index < CANONICAL_CONTRACTS.length; index += 1) {
  let removed;
  const id = CANONICAL_CONTRACTS[index].id;
  exercise(
    `canonical contract row ${id}`,
    () => { [removed] = baseline.contracts.splice(index, 1); },
    () => { baseline.contracts.splice(index, 0, removed); },
    /contracts count|canonical row/,
  );
}

for (let index = 0; index < CANONICAL_SURFACES.length; index += 1) {
  let removedDefinition;
  let removedRecord;
  const id = CANONICAL_SURFACES[index].id;
  exercise(
    `canonical surface row ${id}`,
    () => { [removedDefinition] = baseline.surfaces.splice(index, 1); },
    () => { baseline.surfaces.splice(index, 0, removedDefinition); },
    /surfaces count|canonical row/,
  );
  exercise(
    `surface record ${id}`,
    () => { [removedRecord] = baseline.surfaceRecords.splice(index, 1); },
    () => { baseline.surfaceRecords.splice(index, 0, removedRecord); },
    /surfaceRecords count|surfaceId/,
  );
}

for (let surfaceIndex = 0; surfaceIndex < CANONICAL_SURFACES.length; surfaceIndex += 1) {
  for (let contractIndex = 0; contractIndex < CANONICAL_CONTRACTS.length; contractIndex += 1) {
    const surface = baseline.surfaceRecords[surfaceIndex];
    const prefix = `${CANONICAL_SURFACES[surfaceIndex].id}/${CANONICAL_CONTRACTS[contractIndex].id}`;
    let removedRecord;
    exercise(
      `contract record ${prefix}`,
      () => { [removedRecord] = surface.contracts.splice(contractIndex, 1); },
      () => { surface.contracts.splice(contractIndex, 0, removedRecord); },
      /contracts count|record is missing|canonical index/,
    );
    const record = surface.contracts[contractIndex];
    for (const field of EVIDENCE_FIELDS) {
      const saved = record[field];
      exercise(
        `evidence ${prefix}.${field}`,
        () => { delete record[field]; },
        () => { record[field] = saved; },
        new RegExp(`missing required field "${field}"`),
      );
    }
  }
}

const firstRecord = baseline.surfaceRecords[0].contracts[0];
function replaceFirst(mutator, label, expected, paths = false) {
  const saved = structuredClone(firstRecord);
  exercise(
    label,
    () => mutator(firstRecord),
    () => {
      for (const key of Object.keys(firstRecord)) delete firstRecord[key];
      Object.assign(firstRecord, saved);
    },
    expected,
    paths,
  );
}

replaceFirst((value) => { value.status = 'missing'; }, 'missing status carrying evidence', /missing but carries evidence/);
replaceFirst((value) => {
  value.status = 'partial';
  for (const field of EVIDENCE_FIELDS) value[field] = [];
}, 'partial status with no evidence', /partial status requires/);
replaceFirst((value) => { value.status = 'partial'; }, 'partial status with complete evidence', /partial status requires/);
replaceFirst((value) => { value.status = 'shrug'; }, 'unknown status', /status must be one of/);
replaceFirst((value) => { value.surprise = []; }, 'unknown record field', /unexpected field "surprise"/);
replaceFirst((value) => { value.implementation.push(FIELD_FIXTURES.implementation); }, 'duplicate evidence path', /duplicate paths/);

for (const field of EVIDENCE_FIELDS) {
  replaceFirst(
    (value) => { value[field] = ['package.json']; },
    `wrong evidence class ${field}`,
    new RegExp(`not a valid ${field} evidence path`),
  );
}
replaceFirst(
  (value) => { for (const field of EVIDENCE_FIELDS) value[field] = ['package.json']; },
  'one catch-all file reused across every evidence class',
  /not a valid implementation evidence path/,
);
replaceFirst((value) => { value.implementation = ['../package.json']; }, 'repository path escape', /escapes the repository/, true);
replaceFirst((value) => { value.implementation = ['C:/not-contained.ts']; }, 'absolute repository path', /repository-relative path/, true);
replaceFirst((value) => { value.implementation = ['packages\\ui\\src\\index.ts']; }, 'backslash repository path', /repository-relative path/, true);
replaceFirst((value) => { value.implementation = ['packages/ui/src/not-real.ts']; }, 'missing path', /does not exist/, true);
replaceFirst((value) => { value.implementation = ['packages/ui/src']; }, 'repository directory evidence', /must name a file|not a regular file blob/, true);

assert.equal(JSON.stringify(baseline), baselineBytes, 'the synthetic baseline was not restored exactly');
assertGreen(baseline, 'final restoration');
console.log(`[inventory-negative] OK: ${red} removals/mutations turned red; exact restoration turned green.`);
console.log('[inventory-negative] docs/inventory/inventory.json was read only and never rewritten.');
