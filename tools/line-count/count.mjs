#!/usr/bin/env node
/** Reproducible release line counter over an exact Git revision. */
import { execFileSync } from 'node:child_process';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const STYLE_MARKUP_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.html', '.htm']);
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'vendor', 'dist', 'out', 'build', 'coverage']);
const GENERATED_FILES = new Set(['site/data/changelog.json', 'site/data/nav.json', 'site/data/release.json']);

export const ROW_ORDER = Object.freeze([
  'App source',
  'Shared source',
  'Engine source',
  'Renderer source',
  'UI source',
  'Tests',
  'Styles / markup',
  'Tools & scripts',
  'Data',
  'Docs / Markdown',
  'Config',
  'Generated',
  'Other project text',
]);

function runGit(argv, encoding = 'utf8') {
  return execFileSync('git', argv, {
    cwd: repoRoot,
    encoding,
    maxBuffer: 1024 * 1024 * 256,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function countLines(content) {
  const parts = content.replace(/\r\n|\r/g, '\n').split('\n');
  if (parts.at(-1) === '') parts.pop();
  return {
    total: parts.length,
    nonBlank: parts.filter((line) => line.trim() !== '').length,
  };
}

export function exclusionReason(path) {
  const name = path.split('/').at(-1);
  if (LOCKFILES.has(name)) return 'Lockfile';
  if (/^(?:LICENSE|NOTICE)(?:\.[^/]*)?$/i.test(path)) return 'Legal metadata';
  const excludedDirectory = path.split('/').find((value) => EXCLUDED_DIRECTORIES.has(value));
  return excludedDirectory ? `Vendored/build output (${excludedDirectory})` : null;
}

export function categorize(path) {
  const ext = extname(path).toLowerCase();
  const basename = path.split('/').at(-1);
  const testPath = /(^|\/)(__tests__|tests?|specs?|fixtures)(\/|$)/i.test(path) ||
    /\.(test|spec)\.[^.]+$/i.test(basename);
  const generated = GENERATED_FILES.has(path) || /(^|\/)(generated|generated-assets)(\/|$)/i.test(path);

  if (testPath) return 'Tests';
  if (generated) return 'Generated';
  if (STYLE_MARKUP_EXTENSIONS.has(ext)) return 'Styles / markup';
  if (path.startsWith('packages/app/src/') && SOURCE_EXTENSIONS.has(ext)) return 'App source';
  if (path.startsWith('packages/shared/src/') && SOURCE_EXTENSIONS.has(ext)) return 'Shared source';
  if (path.startsWith('packages/engine/src/') && SOURCE_EXTENSIONS.has(ext)) return 'Engine source';
  if (path.startsWith('packages/renderer/src/') && SOURCE_EXTENSIONS.has(ext)) return 'Renderer source';
  if (path.startsWith('packages/ui/src/') && SOURCE_EXTENSIONS.has(ext)) return 'UI source';
  if (path.startsWith('balance/') && ext === '.json') return 'Data';
  if (ext === '.md') return 'Docs / Markdown';
  if (
    path.startsWith('tools/') || path.startsWith('scripts/') ||
    (SOURCE_EXTENSIONS.has(ext) && !path.includes('/')) || /^[^/]+\.(bat|ps1|sh)$/i.test(path)
  ) return 'Tools & scripts';
  if (['.json', '.yml', '.yaml', '.toml'].includes(ext) || /(^|\/)tsconfig[^/]*\.json$/.test(path)) return 'Config';
  return 'Other project text';
}

function listFiles(rev) {
  const output = runGit(['ls-tree', '-r', '-z', '--name-only', rev], 'buffer');
  return output.toString('utf8').split('\0').filter(Boolean);
}

function readFileAtRevision(rev, path) {
  return runGit(['show', `${rev}:${path}`], 'buffer');
}

function decodeText(buffer) {
  if (buffer.subarray(0, 8000).includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function classifyCommit(sha, cache) {
  if (cache.has(sha)) return cache.get(sha);
  let classification = 'unattributed';
  try {
    const info = runGit(['show', '-s', '--format=%ae%n%B', sha]);
    const [authorEmail, ...body] = info.split('\n');
    classification = authorEmail.trim().toLowerCase() === 'noreply@anthropic.com' ||
      /Co-Authored-By:.*Claude/i.test(body.join('\n')) ? 'agent' : 'human';
  } catch {
    // Metadata that cannot be read is unknown, never silently human-authored.
  }
  cache.set(sha, classification);
  return classification;
}

export function arithmeticMatches(lineTotal, attributionTotal) {
  return lineTotal === attributionTotal;
}

function percent(part, whole) {
  return whole === 0 ? '0.0%' : `${((part / whole) * 100).toFixed(1)}%`;
}

function parseArguments(argv) {
  let rev = 'HEAD';
  let deliberateMismatch = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--rev') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--rev requires a revision');
      rev = argv[index + 1];
      index += 1;
    } else if (value === '--self-test-arithmetic-mismatch') {
      deliberateMismatch = true;
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  return { rev, deliberateMismatch };
}

export function main(argv = process.argv.slice(2)) {
  const { rev, deliberateMismatch } = parseArguments(argv);
  if (deliberateMismatch) {
    console.error('[line-count] ERROR: attribution total (0) does not match grand text total (1).');
    return 1;
  }

  // Resolve the revision before producing a report. An invalid revision must fail closed.
  runGit(['rev-parse', '--verify', `${rev}^{commit}`]);
  const files = listFiles(rev);
  const rows = new Map(ROW_ORDER.map((name) => [name, { files: 0, total: 0, nonBlank: 0 }]));
  const excludedRows = new Map();
  const textCounts = new Map();
  let binaryFiles = 0;

  for (const path of files) {
    const bytes = readFileAtRevision(rev, path);
    const content = decodeText(bytes);
    if (content === null) {
      binaryFiles += 1;
      continue;
    }
    const count = countLines(content);
    textCounts.set(path, count);
    const reason = exclusionReason(path);
    const target = reason
      ? (excludedRows.get(reason) ?? { files: 0, total: 0, nonBlank: 0 })
      : rows.get(categorize(path));
    target.files += 1;
    target.total += count.total;
    target.nonBlank += count.nonBlank;
    if (reason) excludedRows.set(reason, target);
  }

  const sum = (values, field) => [...values].reduce((total, row) => total + row[field], 0);
  const project = {
    files: sum(rows.values(), 'files'),
    total: sum(rows.values(), 'total'),
    nonBlank: sum(rows.values(), 'nonBlank'),
  };
  const excluded = {
    files: sum(excludedRows.values(), 'files'),
    total: sum(excludedRows.values(), 'total'),
    nonBlank: sum(excludedRows.values(), 'nonBlank'),
  };
  const grand = {
    files: project.files + excluded.files,
    total: project.total + excluded.total,
    nonBlank: project.nonBlank + excluded.nonBlank,
  };

  const attribution = { agent: 0, human: 0, unattributed: 0 };
  const classificationCache = new Map();
  for (const [path, count] of textCounts) {
    let blame;
    try {
      blame = runGit(['blame', '--line-porcelain', rev, '--', path]);
    } catch {
      attribution.unattributed += count.total;
      continue;
    }
    let sha = null;
    for (const line of blame.split('\n')) {
      if (/^[0-9a-f]{40} /.test(line)) sha = line.slice(0, 40);
      else if (line.startsWith('\t')) {
        const classification = sha ? classifyCommit(sha, classificationCache) : 'unattributed';
        attribution[classification] += 1;
      }
    }
  }
  const attributionTotal = attribution.agent + attribution.human + attribution.unattributed;

  console.log(`# Meadowmark line count (${rev})\n`);
  console.log('## Size by area\n');
  console.log('| Area | Files | Total lines | Non-blank lines |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const name of ROW_ORDER) {
    const row = rows.get(name);
    console.log(`| ${name} | ${row.files} | ${row.total} | ${row.nonBlank} |`);
  }
  console.log(`| **Project total** | **${project.files}** | **${project.total}** | **${project.nonBlank}** |\n`);

  console.log('## Explicitly excluded text\n');
  console.log('Lockfiles, vendored trees, dependency directories, and build output are not project code. Their text remains visible here and in the grand text total.\n');
  console.log('| Reason | Files | Total lines | Non-blank lines |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const [reason, row] of excludedRows) console.log(`| ${reason} | ${row.files} | ${row.total} | ${row.nonBlank} |`);
  console.log(`| **Excluded text total** | **${excluded.files}** | **${excluded.total}** | **${excluded.nonBlank}** |\n`);

  console.log('## Grand text total (project + excluded)\n');
  console.log('| Text files | Binary files (not line-counted) | Total lines | Non-blank lines |');
  console.log('| ---: | ---: | ---: | ---: |');
  console.log(`| ${grand.files} | ${binaryFiles} | ${grand.total} | ${grand.nonBlank} |\n`);

  console.log('## Author attribution (surviving text lines, via `git blame`)\n');
  console.log('A commit is agent-authored when its author email is `noreply@anthropic.com` or its message has a `Co-Authored-By` trailer naming Claude. Metadata/read failures are unattributed, never guessed to be human.\n');
  console.log('| Author | Lines | Share |');
  console.log('| --- | ---: | ---: |');
  console.log(`| Agent (Claude) | ${attribution.agent} | ${percent(attribution.agent, attributionTotal)} |`);
  console.log(`| Human | ${attribution.human} | ${percent(attribution.human, attributionTotal)} |`);
  console.log(`| Unattributed | ${attribution.unattributed} | ${percent(attribution.unattributed, attributionTotal)} |`);
  console.log(`| **Total** | **${attributionTotal}** | **${percent(attributionTotal, attributionTotal)}** |\n`);

  if (!arithmeticMatches(grand.total, attributionTotal)) {
    console.error(`[line-count] ERROR: attribution total (${attributionTotal}) does not match grand text total (${grand.total}).`);
    return 1;
  }
  console.log(`_Counted with \`node tools/line-count/count.mjs --rev ${rev}\` from tools/line-count/count.mjs_`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[line-count] ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
