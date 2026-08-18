#!/usr/bin/env node
/** Fail-closed, schema-backed, per-surface completeness inventory validator. */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_CONTRACTS,
  CANONICAL_SURFACES,
  EVIDENCE_FIELDS,
  EVIDENCE_PATH_RULES,
  EXPECTED_CONTRACT_COUNT,
  EXPECTED_SURFACE_COUNT,
  INVENTORY_SCHEMA_VERSION,
  NON_ENDPOINT_HTML,
  STATUS_VALUES,
} from './canonical.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const inventoryPath = join(repoRoot, 'docs', 'inventory', 'inventory.json');
const schemaPath = join(repoRoot, 'docs', 'inventory', 'inventory.schema.json');
const TOP_KEYS = new Set(['$schema', 'schemaVersion', 'notes', 'contracts', 'surfaces', 'surfaceRecords']);
const CONTRACT_KEYS = new Set(['id', 'title']);
const SURFACE_KEYS = new Set(['id', 'kind', 'endpoint', 'title']);
const SURFACE_RECORD_KEYS = new Set(['surfaceId', 'contracts']);
const EVIDENCE_RECORD_KEYS = new Set(['contractId', 'status', ...EVIDENCE_FIELDS]);

function parseJson(path, label, violations) {
  if (!existsSync(path)) {
    violations.push(`${label} is missing: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    violations.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function exactKeys(value, expected, label, violations) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    violations.push(`${label} must be an object`);
    return false;
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) violations.push(`${label} is missing required field "${key}"`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) violations.push(`${label} has unexpected field "${key}"`);
  }
  return true;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate];
}

function exactRegistry(actual, expected, label, violations) {
  if (!Array.isArray(actual)) {
    violations.push(`${label} must be an array`);
    return;
  }
  if (actual.length !== expected.length) {
    violations.push(`${label} count is ${actual.length}; expected exactly ${expected.length}`);
  }
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    const received = actual[index];
    const canonical = expected[index];
    if (!canonical) {
      violations.push(`${label}[${index}] is an extra row: ${JSON.stringify(received)}`);
    } else if (!received) {
      violations.push(`${label}[${index}] is missing canonical row "${canonical.id}"`);
    } else if (received.id !== canonical.id || received.title !== canonical.title ||
               received.kind !== canonical.kind || received.endpoint !== canonical.endpoint) {
      violations.push(`${label}[${index}] must be ${JSON.stringify(canonical)}; received ${JSON.stringify(received)}`);
    }
  }
}

function siteEndpoints(root) {
  const result = [];
  const excluded = new Set(NON_ENDPOINT_HTML.map((value) => value.path));
  function visit(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) visit(join(directory, entry.name), relativePath);
      else if (entry.isFile() && entry.name.endsWith('.html') && !excluded.has(relativePath)) result.push(relativePath);
    }
  }
  visit(join(root, 'site'), 'site');
  return result.sort();
}

function schemaContract(schema, violations) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    violations.push('inventory.schema.json must use JSON Schema draft 2020-12');
  }
  if (schema?.properties?.schemaVersion?.const !== INVENTORY_SCHEMA_VERSION) {
    violations.push(`schemaVersion schema constant must be ${INVENTORY_SCHEMA_VERSION}`);
  }
  if (JSON.stringify(schema['x-evidence-fields']) !== JSON.stringify(EVIDENCE_FIELDS)) {
    violations.push(`schema x-evidence-fields must be exactly ${JSON.stringify(EVIDENCE_FIELDS)}`);
  }
  const required = schema?.$defs?.contractRecord?.required;
  if (JSON.stringify(required) !== JSON.stringify(['contractId', 'status', ...EVIDENCE_FIELDS])) {
    violations.push('schema contractRecord.required does not match the canonical evidence fields');
  }
  if (JSON.stringify(schema?.$defs?.contractRecord?.properties?.status?.enum) !== JSON.stringify(STATUS_VALUES)) {
    violations.push(`schema status enum must be exactly ${JSON.stringify(STATUS_VALUES)}`);
  }
  if (schema?.properties?.contracts?.minItems !== EXPECTED_CONTRACT_COUNT ||
      schema?.properties?.contracts?.maxItems !== EXPECTED_CONTRACT_COUNT) {
    violations.push(`schema contracts cardinality must be exactly ${EXPECTED_CONTRACT_COUNT}`);
  }
  if (schema?.properties?.surfaces?.minItems !== EXPECTED_SURFACE_COUNT ||
      schema?.properties?.surfaces?.maxItems !== EXPECTED_SURFACE_COUNT ||
      schema?.properties?.surfaceRecords?.minItems !== EXPECTED_SURFACE_COUNT ||
      schema?.properties?.surfaceRecords?.maxItems !== EXPECTED_SURFACE_COUNT) {
    violations.push(`schema surface cardinality must be ${EXPECTED_SURFACE_COUNT}`);
  }
}

function repositoryFile(candidate, label, field, root, revision, cache, violations) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\\') ||
      isAbsolute(candidate) || candidate.startsWith('/') || candidate.includes('\0')) {
    violations.push(`${label} must be a non-empty forward-slash repository-relative path`);
    return;
  }
  const resolved = resolve(root, candidate);
  const lexical = relative(root, resolved);
  if (lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    violations.push(`${label} escapes the repository: ${candidate}`);
    return;
  }
  const fieldRule = EVIDENCE_PATH_RULES[field];
  if (!fieldRule?.test(candidate)) {
    violations.push(`${label} is not a valid ${field} evidence path: ${candidate}`);
  }
  let state = cache.get(candidate);
  if (!state) {
    try {
      const link = lstatSync(resolved).isSymbolicLink();
      const segments = candidate.split('/');
      let ancestor = root;
      let linkedAncestor = false;
      for (const segment of segments.slice(0, -1)) {
        ancestor = join(ancestor, segment);
        if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) linkedAncestor = true;
      }
      const real = realpathSync(resolved);
      const realRelative = relative(realpathSync(root), real);
      let trackedBlob = true;
      let gitMode = null;
      try {
        execFileSync('git', ['cat-file', '-e', `${revision}:${candidate}`], {
          cwd: root,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        const treeEntry = execFileSync('git', ['ls-tree', revision, '--', candidate], {
          cwd: root,
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();
        gitMode = treeEntry.split(/\s+/, 1)[0] || null;
      } catch {
        trackedBlob = false;
      }
      state = {
        exists: true,
        link,
        linkedAncestor,
        trackedBlob,
        gitMode,
        contained: realRelative !== '..' && !realRelative.startsWith(`..${sep}`) && !isAbsolute(realRelative),
        file: lstatSync(real).isFile(),
      };
    } catch {
      state = { exists: false, link: false, linkedAncestor: false, trackedBlob: false, gitMode: null, contained: false, file: false };
    }
    cache.set(candidate, state);
  }
  if (!state.exists) violations.push(`${label} does not exist: ${candidate}`);
  else if (state.link) violations.push(`${label} must not be a symbolic link: ${candidate}`);
  else if (state.linkedAncestor) violations.push(`${label} has a symbolic-link ancestor: ${candidate}`);
  else if (!state.contained) violations.push(`${label} resolves outside the repository: ${candidate}`);
  else if (!state.file) violations.push(`${label} must name a file: ${candidate}`);
  else if (!state.trackedBlob) violations.push(`${label} must name a file blob present at revision ${revision}: ${candidate}`);
  else if (!/^100\d{3}$/.test(state.gitMode ?? '')) violations.push(`${label} is not a regular file blob at revision ${revision}: ${candidate}`);
}

export function validateInventoryDocument({
  inventory,
  schema,
  root = repoRoot,
  requireComplete = true,
  verifyRepositoryPaths = true,
  verifyDiscoveredEndpoints = true,
  failFast = false,
} = {}) {
  const violations = [];
  const incomplete = [];
  const cache = new Map();
  let revision = null;
  if (verifyRepositoryPaths) {
    try {
      revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
    } catch (error) {
      violations.push(`could not resolve evidence revision HEAD: ${error.message}`);
    }
  }
  if (CANONICAL_CONTRACTS.length !== EXPECTED_CONTRACT_COUNT) {
    violations.push(`canonical contract count is ${CANONICAL_CONTRACTS.length}; expected ${EXPECTED_CONTRACT_COUNT}`);
  }
  if (CANONICAL_SURFACES.length !== EXPECTED_SURFACE_COUNT) {
    violations.push(`canonical surface count is ${CANONICAL_SURFACES.length}; expected ${EXPECTED_SURFACE_COUNT}`);
  }
  schemaContract(schema, violations);
  if (!exactKeys(inventory, TOP_KEYS, 'inventory', violations)) {
    return { violations, incomplete, counts: null };
  }
  if (inventory.$schema !== './inventory.schema.json') violations.push('inventory.$schema must be "./inventory.schema.json"');
  if (inventory.schemaVersion !== INVENTORY_SCHEMA_VERSION) violations.push(`inventory.schemaVersion must be ${INVENTORY_SCHEMA_VERSION}`);
  if (!Array.isArray(inventory.notes) || inventory.notes.length === 0 ||
      inventory.notes.some((note) => typeof note !== 'string' || note.length === 0)) {
    violations.push('inventory.notes must be a non-empty array of non-empty strings');
  }

  if (Array.isArray(inventory.contracts)) {
    inventory.contracts.forEach((value, index) => exactKeys(value, CONTRACT_KEYS, `contracts[${index}]`, violations));
    const repeated = duplicateValues(inventory.contracts.map((value) => value?.id));
    if (repeated.length) violations.push(`duplicate contract IDs: ${repeated.join(', ')}`);
  }
  exactRegistry(inventory.contracts, CANONICAL_CONTRACTS, 'contracts', violations);
  if (failFast && violations.length) return { violations, incomplete, counts: null };
  if (Array.isArray(inventory.surfaces)) {
    inventory.surfaces.forEach((value, index) => exactKeys(value, SURFACE_KEYS, `surfaces[${index}]`, violations));
    const repeated = duplicateValues(inventory.surfaces.map((value) => value?.id));
    if (repeated.length) violations.push(`duplicate surface IDs: ${repeated.join(', ')}`);
  }
  exactRegistry(inventory.surfaces, CANONICAL_SURFACES, 'surfaces', violations);
  if (failFast && violations.length) return { violations, incomplete, counts: null };

  if (verifyDiscoveredEndpoints) {
    try {
      const discovered = siteEndpoints(root);
      const registered = CANONICAL_SURFACES.filter((value) => value.kind === 'site-endpoint')
        .map((value) => value.endpoint).sort();
      if (JSON.stringify(discovered) !== JSON.stringify(registered)) {
        violations.push(`site endpoint drift: discovered ${JSON.stringify(discovered)}, registered ${JSON.stringify(registered)}`);
      }
    } catch (error) {
      violations.push(`could not enumerate site endpoints: ${error.message}`);
    }
    if (failFast && violations.length) return { violations, incomplete, counts: null };
  }

  if (!Array.isArray(inventory.surfaceRecords)) {
    violations.push('surfaceRecords must be an array');
    return { violations, incomplete, counts: null };
  }
  if (inventory.surfaceRecords.length !== CANONICAL_SURFACES.length) {
    violations.push(`surfaceRecords count is ${inventory.surfaceRecords.length}; expected ${CANONICAL_SURFACES.length}`);
  }
  const duplicateSurfaces = duplicateValues(inventory.surfaceRecords.map((value) => value?.surfaceId));
  if (duplicateSurfaces.length) violations.push(`duplicate surfaceRecords: ${duplicateSurfaces.join(', ')}`);
  const counts = { done: 0, partial: 0, missing: 0, total: 0 };

  for (let surfaceIndex = 0; surfaceIndex < CANONICAL_SURFACES.length; surfaceIndex += 1) {
    const canonicalSurface = CANONICAL_SURFACES[surfaceIndex];
    const surface = inventory.surfaceRecords[surfaceIndex];
    if (!surface) {
      violations.push(`surfaceRecords[${surfaceIndex}] is missing for ${canonicalSurface.id}`);
      continue;
    }
    exactKeys(surface, SURFACE_RECORD_KEYS, `surfaceRecords[${surfaceIndex}]`, violations);
    if (surface.surfaceId !== canonicalSurface.id) violations.push(`surfaceRecords[${surfaceIndex}].surfaceId must be "${canonicalSurface.id}"`);
    if (failFast && violations.length) return { violations, incomplete, counts };
    if (!Array.isArray(surface.contracts)) {
      violations.push(`${canonicalSurface.id}.contracts must be an array`);
      continue;
    }
    if (surface.contracts.length !== CANONICAL_CONTRACTS.length) {
      violations.push(`${canonicalSurface.id}.contracts count is ${surface.contracts.length}; expected ${CANONICAL_CONTRACTS.length}`);
    }
    const duplicateContracts = duplicateValues(surface.contracts.map((value) => value?.contractId));
    if (duplicateContracts.length) violations.push(`${canonicalSurface.id} has duplicate contract rows: ${duplicateContracts.join(', ')}`);

    for (let contractIndex = 0; contractIndex < CANONICAL_CONTRACTS.length; contractIndex += 1) {
      const canonicalContract = CANONICAL_CONTRACTS[contractIndex];
      const record = surface.contracts[contractIndex];
      const label = `${canonicalSurface.id}/${canonicalContract.id}`;
      if (!record) {
        violations.push(`${label} record is missing`);
        continue;
      }
      exactKeys(record, EVIDENCE_RECORD_KEYS, label, violations);
      if (record.contractId !== canonicalContract.id) violations.push(`${label} is not at its canonical index`);
      if (failFast && violations.length) return { violations, incomplete, counts };
      if (!STATUS_VALUES.includes(record.status)) {
        violations.push(`${label}.status must be one of ${STATUS_VALUES.join('|')}`);
        continue;
      }
      let populated = 0;
      for (const field of EVIDENCE_FIELDS) {
        const paths = record[field];
        if (!Array.isArray(paths)) {
          violations.push(`${label}.${field} must be an array`);
          continue;
        }
        if (duplicateValues(paths).length) violations.push(`${label}.${field} contains duplicate paths`);
        if (paths.length) populated += 1;
        if (verifyRepositoryPaths && revision) {
          paths.forEach((path, index) => repositoryFile(path, `${label}.${field}[${index}]`, field, root, revision, cache, violations));
        } else {
          paths.forEach((path, index) => {
            if (typeof path === 'string' && !EVIDENCE_PATH_RULES[field]?.test(path)) {
              violations.push(`${label}.${field}[${index}] is not a valid ${field} evidence path: ${path}`);
            }
          });
        }
        if (failFast && violations.length) return { violations, incomplete, counts };
      }
      if (record.status === 'missing' && populated !== 0) violations.push(`${label} is missing but carries evidence`);
      if (record.status === 'partial' && (populated === 0 || populated === EVIDENCE_FIELDS.length)) {
        violations.push(`${label} partial status requires at least one and fewer than all evidence classes`);
      }
      if (record.status === 'done' && populated !== EVIDENCE_FIELDS.length) {
        violations.push(`${label} is done but ${EVIDENCE_FIELDS.length - populated} evidence class(es) are empty`);
      }
      if (failFast && violations.length) return { violations, incomplete, counts };
      counts[record.status] += 1;
      counts.total += 1;
      if (requireComplete && record.status !== 'done') incomplete.push(`${label}: ${record.status}`);
    }
  }
  const expectedRows = CANONICAL_SURFACES.length * CANONICAL_CONTRACTS.length;
  if (counts.total !== expectedRows) violations.push(`validated ${counts.total} rows; expected exactly ${expectedRows}`);
  return { violations, incomplete, counts };
}

function printResult(result) {
  console.log('# Meadowmark canonical completeness inventory\n');
  if (result.counts) {
    console.log('| Status | Rows |');
    console.log('| --- | ---: |');
    for (const status of STATUS_VALUES) console.log(`| ${status} | ${result.counts[status]} |`);
    console.log(`| **total** | **${result.counts.total}** |\n`);
  }
  if (result.violations.length) {
    console.error(`[inventory] STRUCTURAL FAILURE: ${result.violations.length} violation(s).`);
    result.violations.slice(0, 100).forEach((value) => console.error(`  - ${value}`));
    if (result.violations.length > 100) console.error(`  - ... ${result.violations.length - 100} more`);
  }
  if (result.incomplete.length) {
    console.error(`[inventory] RELEASE BLOCKED: ${result.incomplete.length} incomplete feature/surface row(s).`);
    result.incomplete.slice(0, 40).forEach((value) => console.error(`  - ${value}`));
    if (result.incomplete.length > 40) console.error(`  - ... ${result.incomplete.length - 40} more`);
  }
  if (!result.violations.length && !result.incomplete.length) {
    console.log('[inventory] OK: every canonical contract is complete on every registered surface.');
  }
}

function main() {
  const violations = [];
  const inventory = parseJson(inventoryPath, 'inventory.json', violations);
  const schema = parseJson(schemaPath, 'inventory.schema.json', violations);
  if (!inventory || !schema) {
    printResult({ violations, incomplete: [], counts: null });
    return 1;
  }
  const result = validateInventoryDocument({ inventory, schema });
  printResult(result);
  return result.violations.length === 0 && result.incomplete.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
