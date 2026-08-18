#!/usr/bin/env node
/**
 * tools/gen-meshes/generate.ts
 *
 * Imports the mesh DSL (via @meadowmark/engine's index, which registers
 * every generated asset as a side effect) and emits a geometry manifest —
 * asset name, vertex/triangle count, and bounding box — as JSON.
 *
 * This manifest is the thing a later check reads to catch a scene
 * referencing a mesh name that does not exist: `requireAsset()` in
 * mesh-dsl.ts already throws at runtime for that case, but this file lets a
 * build-time or CI-time check compare "names the game references" against
 * "names that are actually registered" without needing to boot a renderer.
 *
 * Usage:
 *   npx tsx tools/gen-meshes/generate.ts [output-path]
 *
 * Defaults to writing packages/engine/dist/mesh-manifest.json relative to
 * the repository root; pass an explicit path to write elsewhere.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManifest, listAssetNames } from '../../packages/engine/src/mesh-dsl.js';
// Side-effect import: registers every generated asset.
import '../../packages/engine/src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultOutput = resolve(here, '../../packages/engine/dist/mesh-manifest.json');
const outputPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultOutput;

const manifest = getManifest();
const names = listAssetNames();

if (manifest.length !== names.length) {
  // This should be structurally impossible given how the registry is built,
  // but a mismatch here would mean the manifest is lying about what's
  // registered — treat it as a hard build failure rather than emit it.
  console.error(
    `gen-meshes: manifest entry count (${manifest.length}) does not match registered asset count (${names.length})`,
  );
  process.exit(1);
}

const payload = {
  generatedAt: new Date().toISOString(),
  assetCount: manifest.length,
  assets: manifest,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`gen-meshes: wrote ${manifest.length} asset entries to ${outputPath}`);
