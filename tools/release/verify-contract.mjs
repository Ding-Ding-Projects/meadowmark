import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const overrideIndex = process.argv.indexOf("--workflow");
const workflowPath = overrideIndex >= 0 ? resolve(process.argv[overrideIndex + 1]) : resolve(root, ".github/workflows/release.yml");
const read = (path) => readFile(resolve(root, path), "utf8");
let [workflow, builder, iconVerifier, iconGenerator, negativeDriver, packageText, bootstrapBatch, bootstrapPowerShell, config, gateText] = await Promise.all([
  readFile(workflowPath, "utf8"),
  read("tools/release/build-installer.ps1"),
  read("tools/release/verify-pe-icon.ps1"),
  read("tools/release/generate-icons.mjs"),
  read("tools/release/verify-contract-negative.mjs"),
  read("package.json"),
  read("download-dependencies.bat"),
  read("tools/release/bootstrap-node.ps1"),
  read("electron-builder.yml"),
  read("release-gate.json"),
]);

function replaceRequired(source, needle, replacement, label) {
  const next = source.replace(needle, replacement);
  if (next === source) throw new Error(`Negative regression could not mutate ${label}.`);
  return next;
}

if (process.argv.includes("--simulate-missing-readback")) {
  workflow = replaceRequired(workflow, "          gh release download $tag --dir $download", "          Write-Host 'read-back removed'", "the release read-back step");
}
if (process.argv.includes("--simulate-renders-gate")) {
  const tagLine = '          $tag = "v$version"';
  workflow = replaceRequired(workflow, tagLine, `          if (-not [bool]$gate.rendersVerified) { throw 'capture required' }\n${tagLine}`, "the live tag-derivation step");
}
if (process.argv.includes("--simulate-package-version-reuse")) {
  const tagLine = '          $tag = "v$version"';
  workflow = replaceRequired(workflow, tagLine, `          throw "Package version $version already shipped; bump package.json before release."\n${tagLine}`, "the live tag-derivation step");
}
if (process.argv.includes("--simulate-reference-icon-loop")) {
  iconVerifier = replaceRequired(iconVerifier,
    "[MeadowmarkIconNative]::ExtractIconEx($ReferenceIcon, 0, [ref]$referenceLarge, [ref]$referenceSmall, 1)",
    "New-Object System.Drawing.Icon $ReferenceIcon, 32, 32",
    "the reference-icon extraction call",
  );
}
if (process.argv.includes("--simulate-undefined-signature")) {
  builder = replaceRequired(builder, "setupSignatureStatus = $setupSignatureStatus", "setupSignatureStatus = [string]$setupSignature.Status", "the signature evidence field");
}
if (process.argv.includes("--simulate-signature-proof-bypass")) {
  builder = replaceRequired(builder, "$setupSignatureStatus = Get-PeCertificateTableState -Path $setup.FullName", "$setupSignatureStatus = 'NotSigned'", "the PE certificate-table proof");
}
if (process.argv.includes("--simulate-signature-result-bypass")) {
  builder = replaceRequired(builder, "if ($setupSignatureStatus -ne 'NotSigned') {", "if ($false) {", "the fail-closed signature verdict");
}
if (process.argv.includes("--simulate-newline-sensitive-svg")) {
  iconGenerator = replaceRequired(iconGenerator, "normalizeNewlines(committedSvg) !== normalizeNewlines(generatedSvg)", "committedSvg !== generatedSvg", "the cross-platform SVG comparison");
}
if (process.argv.includes("--simulate-missing-sign-executable")) {
  config = replaceRequired(config, "  signExecutable: false", "  # signExecutable: false", "the active unsigned packaging setting");
}
if (process.argv.includes("--simulate-attempt-tag")) {
  const tagLine = '          $tag = "v$version"';
  workflow = replaceRequired(workflow, tagLine, `          $runAttempt = [int64]$env:GITHUB_RUN_ATTEMPT\n          $tag = "v$version-a$runAttempt"`, "the stable release tag");
}
if (process.argv.includes("--simulate-missing-run-ownership")) {
  workflow = replaceRequired(workflow, "          $runMarker = '/actions/runs/${{ github.run_id }}'", "          $runMarker = ''", "the workflow-run ownership marker");
}
if (process.argv.includes("--simulate-published-note-rewrite")) {
  const sequence = "      - name: Write preliminary factual release notes\n        id: notes\n        if: steps.release_state.outputs.state != 'published'";
  workflow = replaceRequired(workflow, sequence, sequence.replace("steps.release_state.outputs.state != 'published'", "always()"), "the published-note preservation condition");
}
if (process.argv.includes("--simulate-missing-timing-recovery")) {
  workflow = replaceRequired(workflow, "          gh release edit $tag --notes-file $notesPath", "          Write-Host 'timing recovery removed'", "published-release timing recovery");
}
if (process.argv.includes("--simulate-ci-test-command")) {
  const tagLine = '          $tag = "v$version"';
  workflow = replaceRequired(workflow, tagLine, `          npm test\n${tagLine}`, "the live tag-derivation step");
}
if (process.argv.includes("--simulate-commented-destroy-icon")) {
  iconVerifier = replaceRequired(iconVerifier, "            if ($referenceLarge -ne [IntPtr]::Zero) { [MeadowmarkIconNative]::DestroyIcon($referenceLarge) | Out-Null }", "            # reference-large DestroyIcon removed", "the active reference-large handle cleanup");
}
if (process.argv.includes("--simulate-powershell-backtick-notes")) {
  const plain = "          Exact commit: ${{ github.sha }}";
  const tick = String.fromCharCode(96);
  workflow = replaceRequired(workflow, plain, "          Exact commit: " + tick + "${{ github.sha }}" + tick, "the release-note commit line");
}
const gate = JSON.parse(gateText);
const packageDocument = JSON.parse(packageText);

function requireExact(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label} is missing exact contract text: ${text}`);
}

function activeLines(source) {
  return source.replace(/\r\n?/g, "\n").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
}

function requireActiveLine(source, pattern, label) {
  if (!pattern.test(activeLines(source))) throw new Error(`${label} is missing an exact active line: ${pattern}`);
}

function workflowStep(name) {
  const normalized = workflow.replace(/\r\n?/g, "\n");
  const marker = `      - name: ${name}\n`;
  const start = normalized.indexOf(marker);
  if (start < 0) throw new Error(`Release workflow is missing the named step: ${name}`);
  const next = normalized.indexOf("\n      - name: ", start + marker.length);
  return normalized.slice(start, next < 0 ? normalized.length : next);
}

function requireStepLine(name, pattern) {
  requireActiveLine(workflowStep(name), pattern, `release workflow step ${name}`);
}

if (gate.schemaVersion !== 2 || typeof gate.rendersVerified !== "boolean") throw new Error("Local release metadata must be schema 2 with an explicit render-evidence verdict.");
if (!gate.renderEvidence || !("sourceCommit" in gate.renderEvidence) || !("manifestPath" in gate.renderEvidence) || !("manifestSha256" in gate.renderEvidence) || gate.renderEvidence.evidenceOnlyPrefix !== "tools/release/evidence/") {
  throw new Error("Local release metadata must reserve exact-commit and hashed-manifest render evidence fields.");
}
if (gate.node.archiveUrl !== `https://nodejs.org/dist/${gate.node.version}/node-${gate.node.version}-${gate.node.platform}.zip`) {
  throw new Error("Pinned Node URL is not canonical and derived from the exact manifest identity.");
}
if (!/^[0-9a-f]{64}$/.test(gate.node.sha256)) throw new Error("Pinned Node SHA-256 is invalid.");

for (const file of [gate.application.masterLogoDefinition, gate.application.masterLogo, gate.application.windowsIcon]) {
  await read(file);
}
if (gate.application.windowsIconSizes.join(",") !== "16,20,24,32,40,48,64,128,256") throw new Error("Windows icon size inventory is incomplete.");
if (packageDocument.scripts?.["check:release-negative"] !== "node tools/release/verify-contract-negative.mjs") {
  throw new Error("package.json must expose the committed release-contract negative regression driver.");
}
for (const flag of [
  "--simulate-renders-gate",
  "--simulate-package-version-reuse",
  "--simulate-missing-readback",
  "--simulate-reference-icon-loop",
  "--simulate-undefined-signature",
  "--simulate-signature-proof-bypass",
  "--simulate-signature-result-bypass",
  "--simulate-newline-sensitive-svg",
  "--simulate-missing-sign-executable",
  "--simulate-attempt-tag",
  "--simulate-missing-run-ownership",
  "--simulate-published-note-rewrite",
  "--simulate-missing-timing-recovery",
  "--simulate-ci-test-command",
  "--simulate-commented-destroy-icon",
  "--simulate-powershell-backtick-notes",
]) requireExact(negativeDriver, flag, "release-contract negative regression driver");

requireActiveLine(config, /^\s*forceCodeSigning:\s*false\s*$/m, "electron-builder configuration");
requireActiveLine(config, /^\s*signExecutable:\s*false\s*$/m, "electron-builder configuration");
requireActiveLine(config, /^\s*buildResources:\s*design\/icons\s*$/m, "electron-builder configuration");
requireActiveLine(config, /^\s*icon:\s*meadowmark\.ico\s*$/m, "electron-builder configuration");
requireExact(config, "${env.RELEASE_COMMIT_SHA}/design/icons/meadowmark.ico", "immutable Squirrel icon URL");
if (/^\s*signAndEditExecutable:\s*false\s*$/m.test(config)) {
  throw new Error("electron-builder configuration must keep PE resource editing available so the packaged icon can be embedded and verified.");
}

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
  "Get-PeCertificateTableState",
  "$setupSignatureStatus = Get-PeCertificateTableState -Path $setup.FullName",
  "if ($setupSignatureStatus -ne 'NotSigned') {",
  "setupSignatureStatus = $setupSignatureStatus",
  '"-c.extraMetadata.version=$version"',
  "inspect-asar-package.mjs",
  "verify-pe-icon.ps1",
  "release-evidence.json",
  "SHA256SUMS.txt",
]) requireExact(builder, contract, "installer verification script");
for (const pattern of [
  /^\s*\$setupSignatureStatus = Get-PeCertificateTableState -Path \$setup\.FullName\s*$/m,
  /^\s*if \(\$setupSignatureStatus -ne 'NotSigned'\) \{\s*$/m,
  /^\s*setupSignatureStatus = \$setupSignatureStatus\s*$/m,
]) requireActiveLine(builder, pattern, "installer signature proof");
if (builder.includes("CreateFromSignedFile")) throw new Error("Installer verification must not infer NotSigned from a certificate-loader exception.");

for (const contract of [
  "ExtractIconEx($ReferenceIcon, 0, [ref]$referenceLarge, [ref]$referenceSmall, 1)",
  "$largeHash -ne $referenceLargeHash -or $smallHash -ne $referenceSmallHash",
  "DestroyIcon($referenceLarge)",
  "DestroyIcon($referenceSmall)",
]) requireExact(iconVerifier, contract, "PE icon verification script");
for (const pattern of [
  /^\s*\$count = \[MeadowmarkIconNative\]::ExtractIconEx\(\$Executable, 0, \[ref\]\$large, \[ref\]\$small, 1\)\s*$/m,
  /^\s*\$referenceCount = \[MeadowmarkIconNative\]::ExtractIconEx\(\$ReferenceIcon, 0, \[ref\]\$referenceLarge, \[ref\]\$referenceSmall, 1\)\s*$/m,
  /^\s*if \(\$largeHash -ne \$referenceLargeHash -or \$smallHash -ne \$referenceSmallHash\) \{\s*$/m,
  /^\s*if \(\$referenceLarge -ne \[IntPtr\]::Zero\) \{ \[MeadowmarkIconNative\]::DestroyIcon\(\$referenceLarge\) \| Out-Null \}\s*$/m,
  /^\s*if \(\$referenceSmall -ne \[IntPtr\]::Zero\) \{ \[MeadowmarkIconNative\]::DestroyIcon\(\$referenceSmall\) \| Out-Null \}\s*$/m,
  /^\s*if \(\$large -ne \[IntPtr\]::Zero\) \{ \[MeadowmarkIconNative\]::DestroyIcon\(\$large\) \| Out-Null \}\s*$/m,
  /^\s*if \(\$small -ne \[IntPtr\]::Zero\) \{ \[MeadowmarkIconNative\]::DestroyIcon\(\$small\) \| Out-Null \}\s*$/m,
]) requireActiveLine(iconVerifier, pattern, "PE icon verification script");
if (iconVerifier.includes("New-Object System.Drawing.Icon $ReferenceIcon")) {
  throw new Error("PE icon verification must not restore environment-dependent System.Drawing reference-frame selection.");
}
requireExact(iconGenerator, 'const normalizeNewlines = (value) => value.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");', "icon generator newline normalization");
requireExact(iconGenerator, "normalizeNewlines(committedSvg) !== normalizeNewlines(generatedSvg)", "cross-platform SVG comparison");

requireActiveLine(workflow, /^\s*branches:\s*\[main\]\s*$/m, "release workflow trigger");
requireActiveLine(workflow, /^\s*workflow_dispatch:\s*\{\}\s*$/m, "release workflow dispatch trigger");
requireActiveLine(workflow, /^\s*runs-on:\s*windows-2025\s*$/m, "release workflow runner");
requireStepLine("Derive a unique monotonic release tag", /^\s*\$runNumber = \[int64\]\$env:GITHUB_RUN_NUMBER\s*$/m);
requireStepLine("Derive a unique monotonic release tag", /^\s*if \(\[int64\]\$parts\[2\] -ne 0\) \{\s*$/m);
requireStepLine("Derive a unique monotonic release tag", /^\s*\$version = "\$\(\$parts\[0\]\)\.\$\(\$parts\[1\]\)\.\$runNumber"\s*$/m);
requireStepLine("Derive a unique monotonic release tag", /^\s*\$tag = "v\$version"\s*$/m);
requireStepLine("Inspect this workflow run's release state", /^\s*\$runMarker = '\/actions\/runs\/\$\{\{ github\.run_id \}\}'\s*$/m);
requireStepLine("Inspect this workflow run's release state", /^\s*throw "Existing release \$tag is not owned by this workflow run and exact commit\."\s*$/m);
requireStepLine("Build runnable application through canonical script", /^\s*run:\s*call build\.bat \/s\s*$/m);
requireStepLine("Build runnable application through canonical script", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Build and verify unsigned installer through canonical script", /^\s*RELEASE_BUILD_VERSION:\s*\$\{\{ steps\.tag\.outputs\.version \}\}\s*$/m);
requireStepLine("Build and verify unsigned installer through canonical script", /^\s*run:\s*call build-installer\.bat \/s\s*$/m);
requireStepLine("Build and verify unsigned installer through canonical script", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Resolve unused published dim-sum code name", /^\s*node tools\/release\/select-dim-sum\.mjs `\s*$/m);
requireStepLine("Resolve unused published dim-sum code name", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*Workflow run: https:\/\/github\.com\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*Exact commit: \$\{\{ github\.sha \}\}\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*<pre><code>\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*\$hashes\s*$/m);
requireStepLine("Write preliminary factual release notes", /^\s*<\/code><\/pre>\s*$/m);
if (workflowStep("Write preliminary factual release notes").includes(String.fromCharCode(96))) {
  throw new Error("Double-quoted PowerShell release-note here-strings must not contain Markdown backticks.");
}
requireStepLine("Create or replace the owned draft release", /^\s*gh release create \$tag `\s*$/m);
requireStepLine("Create or replace the owned draft release", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Publish the release exactly once", /^\s*gh release edit '\$\{\{ steps\.tag\.outputs\.tag \}\}' --draft=false\s*$/m);
requireStepLine("Publish the release exactly once", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Finalize release notes with publication timing", /^\s*\$jobs = gh api 'repos\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}\/jobs\?filter=all&per_page=100' \| ConvertFrom-Json\s*$/m);
requireStepLine("Finalize release notes with publication timing", /^\s*if:\s*steps\.release_state\.outputs\.state != 'published'\s*$/m);
requireStepLine("Recover timing without changing published release identity", /^\s*if \(\$notes -notmatch 'Workflow duration: \\d\{2\}:\\d\{2\}:\\d\{2\}'\) \{\s*$/m);
requireStepLine("Recover timing without changing published release identity", /^\s*if:\s*steps\.release_state\.outputs\.state == 'published'\s*$/m);
requireStepLine("Recover timing without changing published release identity", /^\s*gh release edit \$tag --notes-file \$notesPath\s*$/m);
requireStepLine("Recover timing without changing published release identity", /^\s*\$notes = \[regex\]::Replace\(\$notes, '\(\?m\)\^Exact commit:\.\*\$', "Exact commit: \$expectedCommit"\)\s*$/m);
requireStepLine("Recover timing without changing published release identity", /^\s*\$artifactSection = "### Artifact SHA-256.*<pre><code>.*\$hashText.*<\/code><\/pre>.*### Workflow timing"\s*$/m);
requireStepLine("Read published release and assets back", /^\s*gh release download \$tag --dir \$download\s*$/m);
requireExact(activeLines(workflowStep("Read published release and assets back")), "$hashMatches = [regex]::Matches([string]$release.body, '(?m)^\\s*([0-9a-f]{64})\\s{2}([^\\r\\n]+)\\r?$')", "release read-back hash parser");
requireStepLine("Read published release and assets back", /^\s*throw 'Published release notes contain disallowed control characters\.'\s*$/m);
requireStepLine("Upload safe build and failure evidence", /^\s*if:\s*\$\{\{ always\(\) \}\}\s*$/m);
requireStepLine("Upload safe build and failure evidence", /^\s*uses:\s*actions\/upload-artifact@v4\s*$/m);

for (const forbidden of [
  /actions\/setup-node/i,
  /^\s*(?:npm|npx|pnpm|yarn)(?:\.cmd)?\s+(?:run\s+)?(?:test|lint)\b/im,
  /tools\/inventory\/check/i,
  /npm\s+run\s+dist/i,
  /\brendersVerified\b/,
  /package-version reuse/i,
  /Package version \$version already shipped/i,
  /bump package\.json before release/i,
  /GITHUB_RUN_ATTEMPT/,
]) {
  if (forbidden.test(workflow)) throw new Error(`Release workflow contains a forbidden bypass, CI check, or publication gate: ${forbidden}`);
}
console.log("Release contract verified statically: every main push or dispatch derives one monotonic package version and stable run tag, then builds, packages, publishes once, and reads back without a render-evidence or package-version-reuse publication gate.");
