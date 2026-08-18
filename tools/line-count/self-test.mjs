#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { arithmeticMatches, categorize, countLines, exclusionReason } from './count.mjs';

const counter = fileURLToPath(new URL('./count.mjs', import.meta.url));

assert.deepEqual(countLines('one\r\n\r\ntwo\r\n'), { total: 3, nonBlank: 2 });
assert.deepEqual(countLines(''), { total: 0, nonBlank: 0 });
assert.equal(categorize('packages/renderer/src/main.ts'), 'Renderer source');
assert.equal(categorize('packages/renderer/index.html'), 'Styles / markup');
assert.equal(categorize('packages/ui/src/components/components.css'), 'Styles / markup');
assert.equal(categorize('packages/ui/test/widget.test.ts'), 'Tests');
assert.equal(categorize('tools/line-count/self-test.mjs'), 'Tests');
assert.equal(categorize('tools/inventory/negative-regression.mjs'), 'Tests');
assert.equal(categorize('site/data/changelog.json'), 'Generated');
assert.equal(categorize('mystery/file.xyz'), 'Other project text');
assert.equal(exclusionReason('package-lock.json'), 'Lockfile');
assert.equal(arithmeticMatches(123, 123), true);
assert.equal(arithmeticMatches(123, 122), false);

const mismatch = spawnSync(process.execPath, [counter, '--self-test-arithmetic-mismatch'], { encoding: 'utf8' });
assert.equal(mismatch.status, 1, `arithmetic mismatch must exit 1; stderr=${mismatch.stderr}`);
assert.match(mismatch.stderr, /does not match grand text total/);

const badRevision = spawnSync(process.execPath, [counter, '--rev', 'definitely-not-a-revision'], { encoding: 'utf8' });
assert.notEqual(badRevision.status, 0, 'invalid revisions must exit nonzero');
assert.match(badRevision.stderr, /\[line-count\] ERROR:/);

console.log('[line-count-self-test] OK: categorization, newline arithmetic, mismatch failure, and invalid-revision failure passed.');
