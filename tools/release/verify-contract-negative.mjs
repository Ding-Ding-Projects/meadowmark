import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const contract = resolve(import.meta.dirname, "verify-contract.mjs");

function run(args) {
  return spawnSync(process.execPath, [contract, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
}

const baseline = run([]);
if (baseline.status !== 0) {
  process.stderr.write(baseline.stderr || baseline.stdout);
  throw new Error(`Release contract baseline exited ${baseline.status}.`);
}

const regressions = [
  ["--simulate-renders-gate", "render-evidence publication gate"],
  ["--simulate-package-version-reuse", "package-version reuse gate"],
  ["--simulate-missing-readback", "missing release read-back"],
  ["--simulate-reference-icon-loop", "environment-dependent reference-icon selection"],
  ["--simulate-undefined-signature", "undefined signature evidence"],
  ["--simulate-signature-proof-bypass", "bypassed PE certificate-table proof"],
  ["--simulate-signature-result-bypass", "bypassed fail-closed signature verdict"],
  ["--simulate-newline-sensitive-svg", "newline-sensitive generated SVG comparison"],
  ["--simulate-missing-sign-executable", "commented-out unsigned packaging setting"],
  ["--simulate-attempt-tag", "attempt-specific duplicate release tag"],
  ["--simulate-missing-run-ownership", "missing workflow-run release ownership marker"],
  ["--simulate-published-note-rewrite", "published release notes rewritten on rerun"],
  ["--simulate-missing-timing-recovery", "missing published-release timing recovery"],
  ["--simulate-ci-test-command", "test command added to the release workflow"],
  ["--simulate-commented-destroy-icon", "commented-out native icon cleanup"],
];

for (const [flag, label] of regressions) {
  const result = run([flag]);
  if (result.status === 0) throw new Error(`Negative regression stayed green: ${label}.`);
  if (result.status === null) throw new Error(`Negative regression did not complete: ${label}.`);
}

console.log(`Release contract negative regressions verified: ${regressions.length} deliberate breakages turned red.`);
