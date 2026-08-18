#!/usr/bin/env node
/**
 * Guard: no bare fs.rename outside the approved atomic-write module.
 *
 * atomic-write.ts is the one place in this project allowed to call
 * fs.rename directly, because it's the one place that retries on Windows
 * sharing violations and uses a unique per-call temp name. A rename
 * written anywhere else bypasses both protections and can silently lose
 * data (see packages/app/src/atomic-write.ts for the full story).
 *
 * This guard fails when it finds a rename call anywhere under
 * packages/*\/src that is not inside the approved file.
 *
 * Two correctness notes worth keeping, because both bit this exact kind
 * of guard before:
 *
 *   - The regex is anchored to the START of a line
 *     (`/^\s*(?:await\s+)?fs(?:\.promises)?\.rename/`), not a bare
 *     substring search. A substring match lets a commented-out call
 *     (`// fs.rename(...)`) or a renamed identifier
 *     (`fs.renameSomethingElse`) satisfy it, which means the guard passes
 *     forever while guarding nothing.
 *
 *   - Line endings are normalized before scanning
 *     (`split(/\r\n|\n|\r/)`). A needle or split written assuming `\n`
 *     silently sees zero lines (and therefore zero violations) on a CRLF
 *     checkout — which is exactly how Windows checks out this repository
 *     by default. A guard that finds nothing because it looked at nothing
 *     is worse than no guard, because it reports clean.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..', '..');
const packagesDir = join(repoRoot, 'packages');

const APPROVED_FILE = join('packages', 'app', 'src', 'atomic-write.ts');

// Anchored to line start (allowing leading whitespace and an optional
// `await`); a commented-out or renamed call cannot satisfy this.
const RENAME_PATTERN = /^\s*(?:await\s+)?fs(?:\.promises)?\.rename(?:Sync)?\s*\(/;

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'out', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot === -1 ? '' : entry.name.slice(dot);
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

function main() {
  let root;
  try {
    root = statSync(packagesDir);
  } catch {
    console.log('[no-bare-rename] packages/ does not exist yet; nothing to scan.');
    return 0;
  }
  if (!root.isDirectory()) {
    console.log('[no-bare-rename] packages/ is not a directory; nothing to scan.');
    return 0;
  }

  const files = walk(packagesDir);
  const violations = [];

  for (const file of files) {
    const relPath = relative(repoRoot, file).split(sep).join('/');
    const approvedRelPath = APPROVED_FILE.split(sep).join('/');
    if (relPath === approvedRelPath) continue;

    const raw = readFileSync(file, 'utf8');
    // Normalize CRLF/CR to LF before scanning: a checkout on Windows is
    // CRLF by default, and a pattern/split written assuming bare \n would
    // otherwise silently see nothing.
    const normalized = raw.replace(/\r\n|\n|\r/g, '\n');
    const lines = normalized.split('\n');

    lines.forEach((line, index) => {
      if (RENAME_PATTERN.test(line)) {
        violations.push({ file: relPath, line: index + 1, text: line.trim() });
      }
    });
  }

  if (violations.length > 0) {
    console.error('[no-bare-rename] Found fs.rename outside the approved atomic-write module:');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.text}`);
    }
    console.error(
      `\nUse atomicWriteFile()/atomicWriteJson() from ${APPROVED_FILE.split(sep).join('/')} instead.`,
    );
    return 1;
  }

  console.log('[no-bare-rename] OK: no bare fs.rename calls outside atomic-write.ts.');
  return 0;
}

process.exitCode = main();
