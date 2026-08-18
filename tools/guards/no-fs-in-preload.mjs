#!/usr/bin/env node
/**
 * Guard: the built preload bundle must only require('electron').
 *
 * The sandboxed preload (packages/app/src/preload.ts, with `sandbox: true`
 * set on the BrowserWindow in main.ts) gets almost no Node built-ins. If a
 * value import anywhere in preload.ts's dependency graph pulls in
 * something like node:fs or node:path -- which happens the moment it
 * imports a non-leaf module such as ipc.ts instead of ipc-channels.ts --
 * esbuild bundles that `require(...)` straight into the emitted
 * preload.cjs. The require then throws at preload load time, BEFORE
 * contextBridge.exposeInMainWorld runs, so window.meadowmark silently
 * never gets defined. Nothing in the source *looks* wrong when this
 * happens; only the emitted bundle tells the truth.
 *
 * This guard reads the actual built packages/app/dist/preload.cjs and
 * fails if it finds any require(...) call whose argument is not
 * "electron".
 *
 * Run after `npm run build` (or packages/app's own build). If dist/
 * doesn't exist yet, this guard reports that plainly rather than passing
 * by default -- a guard that can't find its target is not evidence of
 * anything.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const bundlePath = join(repoRoot, 'packages', 'app', 'dist', 'preload.cjs');

const ALLOWED_REQUIRES = new Set(['electron']);

function main() {
  if (!existsSync(bundlePath)) {
    console.error(
      `[no-fs-in-preload] ${bundlePath} does not exist. Run the app build first ` +
        '(this guard checks the emitted bundle, not the source, on purpose).',
    );
    return 1;
  }

  const bundle = readFileSync(bundlePath, 'utf8');
  const matches = [...bundle.matchAll(/require\((["'])([^"']+)\1\)/g)].map((m) => m[2]);
  const uniqueRequires = [...new Set(matches)].sort();

  const disallowed = uniqueRequires.filter((mod) => !ALLOWED_REQUIRES.has(mod));

  console.log(`[no-fs-in-preload] preload.cjs requires: ${uniqueRequires.join(', ') || '(none)'}`);

  if (disallowed.length > 0) {
    console.error(
      '[no-fs-in-preload] FAILED: preload.cjs requires something other than "electron": ' +
        `${disallowed.join(', ')}. This means a value import in preload.ts's dependency ` +
        'graph pulled in a module that touches Node built-ins unavailable to a sandboxed ' +
        'preload (sandbox: true in main.ts). Trace which import did it and route it through ' +
        "a leaf module like ipc-channels.ts instead, or make it `import type`. Do NOT fix " +
        'this by setting sandbox: false.',
    );
    return 1;
  }

  console.log('[no-fs-in-preload] OK: preload.cjs only requires "electron".');
  return 0;
}

process.exitCode = main();
