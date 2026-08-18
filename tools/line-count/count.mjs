#!/usr/bin/env node
/**
 * Meadowmark's committed line counter.
 *
 * The CI release workflow runs this exact script over the tagged commit
 * and publishes its table verbatim in the release notes, so the count in
 * a release is always produced by the same run that built the artifacts,
 * from the exact commit being released — never hand-typed, never re-
 * derived by an agent with a shell one-liner.
 *
 * Everything is read from `git show HEAD:<path>` / `git ls-tree`, not the
 * working tree, so the two tables below (the size breakdown and the
 * author-attribution breakdown) are counting the exact same bytes and can
 * never quietly disagree with each other because one read a dirty file
 * and the other didn't.
 *
 * IMPORTANT arithmetic note: `git blame` does not count a file's trailing
 * newline as an extra line. If this script counted lines with a naive
 * `content.split("\n").length`, a file ending in "\n" would report one
 * line more than blame attributes, and the attribution table's total
 * would permanently disagree with the size table's total. We strip a
 * single trailing empty element after splitting to match blame's
 * counting exactly (see `countLines`).
 *
 * Usage: node tools/line-count/count.mjs [--rev <ref>]
 */

import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = new URL('../../', import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);

const args = process.argv.slice(2);
const revIndex = args.indexOf('--rev');
const rev = revIndex !== -1 ? args[revIndex + 1] : 'HEAD';

function git(argv) {
  return execFileSync('git', argv, {
    cwd: repoRootPath,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
}

function tryGit(argv) {
  try {
    return git(argv);
  } catch {
    return null;
  }
}

/**
 * Splits file content into lines the way `git blame` counts them: a
 * trailing newline does not create a phantom extra (empty) line.
 */
function countLines(content) {
  const normalized = content.replace(/\r\n|\n|\r/g, '\n');
  const parts = normalized.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  const total = parts.length;
  const nonBlank = parts.filter((line) => line.trim() !== '').length;
  return { total, nonBlank };
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

/**
 * Buckets a tracked path into one of the named report rows, or `null`
 * ("Other") for anything the project explicitly excludes from its own
 * total (e.g. LICENSE) — still shown, but only in the grand total.
 */
function categorize(path) {
  const ext = extname(path);

  if (ext === '.md') return 'Docs / Markdown';

  if (path.startsWith('balance/') && ext === '.json') return 'Data (balance JSON)';

  if (path.startsWith('packages/app/src/') && SOURCE_EXTS.has(ext)) return 'App source';
  if (path.startsWith('packages/shared/src/') && SOURCE_EXTS.has(ext)) return 'Shared source';
  if (path.startsWith('packages/engine/src/') && SOURCE_EXTS.has(ext)) return 'Engine source';
  if (path.startsWith('packages/ui/src/') && SOURCE_EXTS.has(ext)) return 'UI source';

  if (
    path.startsWith('tools/') ||
    path.startsWith('scripts/') ||
    (SOURCE_EXTS.has(ext) && !path.includes('/')) ||
    /^[^/]+\.bat$/i.test(path)
  ) {
    return 'Tools & scripts';
  }

  if (
    ext === '.json' ||
    ext === '.yml' ||
    ext === '.yaml' ||
    path === 'electron-builder.yml' ||
    /tsconfig.*\.json$/.test(path)
  ) {
    return 'Config';
  }

  return null; // "Other" -- reported, excluded from the project total.
}

const ROW_ORDER = [
  'App source',
  'Shared source',
  'Engine source',
  'UI source',
  'Tools & scripts',
  'Data (balance JSON)',
  'Docs / Markdown',
  'Config',
];

function listFiles() {
  const raw = tryGit(['ls-tree', '-r', '--name-only', rev]);
  if (raw === null) {
    console.error(`[line-count] Could not read tree at ${rev}. Is this a git repository with a commit?`);
    return [];
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readFileAtRev(path) {
  const raw = tryGit(['show', `${rev}:${path}`]);
  return raw;
}

const NUL = String.fromCharCode(0);

function isProbablyBinary(content) {
  // Cheap heuristic: a NUL byte in the first 8000 chars means binary.
  return content.slice(0, 8000).includes(NUL);
}

// ---- Size breakdown ----------------------------------------------------

const files = listFiles();
const rows = new Map(); // bucket -> { total, nonBlank, files }
const excluded = { total: 0, nonBlank: 0, files: 0 };

for (const bucket of ROW_ORDER) {
  rows.set(bucket, { total: 0, nonBlank: 0, files: 0 });
}

const fileLineCounts = new Map(); // path -> { total, nonBlank }

for (const path of files) {
  const content = readFileAtRev(path);
  if (content === null || isProbablyBinary(content)) continue;

  const { total, nonBlank } = countLines(content);
  fileLineCounts.set(path, { total, nonBlank });

  const bucket = categorize(path);
  if (bucket && rows.has(bucket)) {
    const row = rows.get(bucket);
    row.total += total;
    row.nonBlank += nonBlank;
    row.files += 1;
  } else {
    excluded.total += total;
    excluded.nonBlank += nonBlank;
    excluded.files += 1;
  }
}

let projectTotal = 0;
let projectNonBlank = 0;
let projectFiles = 0;
for (const row of rows.values()) {
  projectTotal += row.total;
  projectNonBlank += row.nonBlank;
  projectFiles += row.files;
}

const grandTotal = projectTotal + excluded.total;
const grandNonBlank = projectNonBlank + excluded.nonBlank;
const grandFiles = projectFiles + excluded.files;

// ---- Author attribution (agent vs. human), by surviving git-blame line -

const AGENT_EMAIL = 'noreply@anthropic.com';
const COAUTHOR_PATTERN = /Co-Authored-By:.*Claude/i;

const commitClassificationCache = new Map(); // sha -> 'agent' | 'human'

function classifyCommit(sha) {
  if (commitClassificationCache.has(sha)) {
    return commitClassificationCache.get(sha);
  }

  const info = tryGit(['show', '-s', '--format=%ae%n%B', sha]);
  let classification = 'human';

  if (info !== null) {
    const [authorEmail, ...bodyParts] = info.split('\n');
    const body = bodyParts.join('\n');
    if (authorEmail.trim().toLowerCase() === AGENT_EMAIL || COAUTHOR_PATTERN.test(body)) {
      classification = 'agent';
    }
  }

  commitClassificationCache.set(sha, classification);
  return classification;
}

let agentLines = 0;
let humanLines = 0;
let unattributedLines = 0;

for (const path of files) {
  if (!fileLineCounts.has(path)) continue; // skipped (binary/unreadable)

  const blame = tryGit(['blame', '--line-porcelain', rev, '--', path]);
  if (blame === null) {
    // No blame history available for this path at this revision (rare;
    // e.g. a path git can't resolve). Count its lines as unattributed
    // rather than silently dropping them, so totals still add up.
    const counted = fileLineCounts.get(path);
    unattributedLines += counted.total;
    continue;
  }

  const lines = blame.split('\n');
  let sha = null;
  for (const line of lines) {
    // A commit-header line is a 40-char hex sha followed by line numbers.
    if (/^[0-9a-f]{40} /.test(line)) {
      sha = line.slice(0, 40);
      continue;
    }
    if (line.startsWith('\t')) {
      // This is an actual content line attributed to the current `sha`.
      if (sha) {
        const cls = classifyCommit(sha);
        if (cls === 'agent') agentLines += 1;
        else humanLines += 1;
      } else {
        unattributedLines += 1;
      }
    }
  }
}

const attributionTotal = agentLines + humanLines + unattributedLines;

// ---- Report --------------------------------------------------------------

function pct(part, whole) {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

console.log(`# Meadowmark line count (${rev})\n`);

console.log('## Size by area\n');
console.log('| Area | Files | Total lines | Non-blank lines |');
console.log('| --- | ---: | ---: | ---: |');
for (const bucket of ROW_ORDER) {
  const row = rows.get(bucket);
  console.log(`| ${bucket} | ${row.files} | ${row.total} | ${row.nonBlank} |`);
}
console.log(`| **Project total** | **${projectFiles}** | **${projectTotal}** | **${projectNonBlank}** |`);
console.log('');

console.log('## Excluded from project total\n');
console.log(
  "Files that are not the project's own source/docs/config/data (e.g. `LICENSE`) are counted here, visibly, rather than silently folded into or silently dropped from the totals above.\n",
);
console.log('| Files | Total lines | Non-blank lines |');
console.log('| ---: | ---: | ---: |');
console.log(`| ${excluded.files} | ${excluded.total} | ${excluded.nonBlank} |`);
console.log('');

console.log('## Grand total (project + excluded)\n');
console.log('| Files | Total lines | Non-blank lines |');
console.log('| ---: | ---: | ---: |');
console.log(`| ${grandFiles} | ${grandTotal} | ${grandNonBlank} |`);
console.log('');

console.log('## Author attribution (surviving lines, via `git blame`)\n');
console.log(
  'Attributed per **surviving** line, never by summing added lines from the log — churn is not authorship, and a line written and later deleted belongs to nobody. A commit counts as agent-written when its author email is `noreply@anthropic.com` or its message carries a `Co-Authored-By` trailer naming Claude.\n',
);
console.log('| Author | Lines | Share |');
console.log('| --- | ---: | ---: |');
console.log(`| Agent (Claude) | ${agentLines} | ${pct(agentLines, attributionTotal)} |`);
console.log(`| Human | ${humanLines} | ${pct(humanLines, attributionTotal)} |`);
if (unattributedLines > 0) {
  console.log(
    `| Unattributed (no blame history) | ${unattributedLines} | ${pct(unattributedLines, attributionTotal)} |`,
  );
}
console.log(`| **Total** | **${attributionTotal}** | **100.0%** |`);
console.log('');

if (attributionTotal !== grandTotal) {
  console.error(
    `[line-count] WARNING: attribution total (${attributionTotal}) does not match grand total (${grandTotal}). ` +
      'This usually means a file exists in the working tree that has no blame history at this revision, or the ' +
      'reverse. Investigate before trusting this report.',
  );
}

console.log('_Counted with `node tools/line-count/count.mjs --rev ' + rev + '` from tools/line-count/count.mjs_');
