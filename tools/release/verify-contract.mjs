import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const overrideIndex = process.argv.indexOf("--workflow");
const workflowPath = overrideIndex >= 0 ? resolve(process.argv[overrideIndex + 1]) : resolve(root, ".github/workflows/release.yml");
const read = (path) => readFile(resolve(root, path), "utf8");
let [workflow, builder, bootstrapBatch, bootstrapPowerShell, config, gateText] = await Promise.all([
  readFile(workflowPath, "utf8"),
  read("tools/release/build-installer.ps1"),
  read("download-dependencies.bat"),
  read("tools/release/bootstrap-node.ps1"),
  read("electron-builder.yml"),
  read("release-gate.json"),
]);
if (process.argv.includes("--simulate-missing-readback")) {
  workflow = workflow.replace("gh release download $tag --dir $download", "Write-Host 'read-back removed'");
}
const gate = JSON.parse(gateText);

function requireExact(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label} is missing exact contract text: ${text}`);
}

if (gate.schemaVersion !== 2 || typeof gate.rendersVerified !== "boolean") throw new Error("Release gate must be schema 2 with an explicit render-evidence verdict.");
if (!gate.renderEvidence || !("sourceCommit" in gate.renderEvidence) || !("manifestPath" in gate.renderEvidence) || !("manifestSha256" in gate.renderEvidence) || gate.renderEvidence.evidenceOnlyPrefix !== "tools/release/evidence/") {
  throw new Error("Release gate must reserve exact-commit and hashed-manifest render evidence fields.");
}
if (gate.node.archiveUrl !== `https://nodejs.org/dist/${gate.node.version}/node-${gate.node.version}-${gate.node.platform}.zip`) {
  throw new Error("Pinned Node URL is not canonical and derived from the exact manifest identity.");
}
if (!/^[0-9a-f]{64}$/.test(gate.node.sha256)) throw new Error("Pinned Node SHA-256 is invalid.");

for (const file of [gate.application.masterLogoDefinition, gate.application.masterLogo, gate.application.windowsIcon]) {
  await read(file);
}
if (gate.application.windowsIconSizes.join(",") !== "16,20,24,32,40,48,64,128,256") throw new Error("Windows icon size inventory is incomplete.");

requireExact(config, "forceCodeSigning: false", "electron-builder configuration");
requireExact(config, "signExecutable: false", "electron-builder configuration");
requireExact(config, "signAndEditExecutable: false", "electron-builder configuration");
requireExact(config, "icon: design/icons/meadowmark.ico", "electron-builder configuration");
requireExact(config, "${env.RELEASE_COMMIT_SHA}/design/icons/meadowmark.ico", "immutable Squirrel icon URL");

requireExact(bootstrapBatch, "tools\\release\\bootstrap-node.ps1", "dependency batch script");
requireExact(bootstrapBatch, "npm.cmd\" ci --no-audit --no-fund", "locked npm install");
requireExact(bootstrapPowerShell, "Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl", "portable Node fallback");
requireExact(bootstrapPowerShell, "Get-HashHex -Path $downloadTemporary -Algorithm SHA256", "download digest validation");
requireExact(bootstrapPowerShell, "Get-ZipEntryHashHex -ArchivePath $archivePath", "portable-content digest validation");

for (const contract of [
  "status --porcelain --untracked-files=all",
  "Remove-Item -LiteralPath $verifiedOutput -Recurse -Force",
  "Expected exactly one $setupName",
  "Expected exactly one RELEASES index",
  "Expected exactly one full package",
  "RELEASES SHA-1 does not match the full package",
  "SignatureStatus]::NotSigned",
  "inspect-asar-package.mjs",
  "verify-pe-icon.ps1",
  "release-evidence.json",
  "SHA256SUMS.txt",
]) requireExact(builder, contract, "installer verification script");

for (const contract of [
  "call build-installer.bat /s",
  "if: ${{ always() }}",
  "uses: actions/upload-artifact@v4",
  "gh release edit '${{ steps.tag.outputs.tag }}' --draft=false",
  "gh release download $tag --dir $download",
  "Read published release and assets back",
  "select-dim-sum.mjs",
  "The photo is linked from the public catalog",
  "sourceCommit -eq '${{ github.sha }}'",
  "manifestSha256",
  "git merge-base --is-ancestor",
  "non-evidence paths changed after capture",
  "only render-evidence fields may change",
  "Resolve-EvidenceFile",
  "manifest.artifact.commit -ne $renderEvidence.sourceCommit",
  "Capture SHA-256 mismatch",
  "runs-on: windows-2025",
  "call build.bat /s",
  "Package version $version already shipped",
  '"tag=v$version"',
]) requireExact(workflow, contract, "release workflow");

for (const forbidden of [/actions\/setup-node/i, /run:\s*.*npm\s+(?:run\s+)?(?:test|lint)\b/i, /tools\/inventory\/check/i, /npm\s+run\s+dist/i]) {
  if (forbidden.test(workflow)) throw new Error(`Release workflow contains forbidden bypass or CI check: ${forbidden}`);
}
if (workflow.includes('"v$($package.version)-r')) throw new Error("Run-id release tags are forbidden because they diverge from the packaged update version.");
console.log("Release contract verified statically: publication stays fail-closed until capture and built-artifact checks succeed.");
