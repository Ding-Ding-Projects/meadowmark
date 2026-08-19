param([switch]$Silent)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Move-WithRetry {
    param([string]$Source, [string]$Destination)
    $lastError = $null
    foreach ($attempt in 0..5) {
        try {
            Move-Item -LiteralPath $Source -Destination $Destination -Force
            return
        } catch {
            $lastError = $_
            if ($_.Exception -is [System.IO.IOException] -or $_.Exception -is [System.UnauthorizedAccessException]) {
                Start-Sleep -Milliseconds (100 * ($attempt + 1))
                continue
            }
            throw
        }
    }
    throw $lastError
}

function Write-AtomicText {
    param([string]$Path, [string]$Value)
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $temporary = Join-Path $parent ('.' + [System.IO.Path]::GetFileName($Path) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [System.IO.File]::WriteAllText($temporary, $Value, [System.Text.UTF8Encoding]::new($false))
        Move-WithRetry -Source $temporary -Destination $Path
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Assert-SafeChild {
    param([string]$Parent, [string]$Child, [string]$Label)
    $parentPrefix = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $resolvedChild = [System.IO.Path]::GetFullPath($Child)
    if (-not $resolvedChild.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label is outside the repository: $resolvedChild"
    }
    return $resolvedChild
}

function Get-HashHex {
    param([string]$Path, [ValidateSet('SHA1', 'SHA256')][string]$Algorithm)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $hasher = if ($Algorithm -eq 'SHA1') { [System.Security.Cryptography.SHA1]::Create() } else { [System.Security.Cryptography.SHA256]::Create() }
        try { return (($hasher.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '') }
        finally { $hasher.Dispose() }
    } finally { $stream.Dispose() }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$gate = Get-Content -LiteralPath (Join-Path $repoRoot 'release-gate.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
if ($gate.schemaVersion -ne 2) { throw 'release-gate.json has an unsupported schemaVersion.' }
$version = [string]$package.version
$productName = [string]$gate.application.productName
$output = Assert-SafeChild -Parent $repoRoot -Child (Join-Path $repoRoot $gate.artifacts.outputDirectory) -Label 'Release output'
if ($output -eq $repoRoot) { throw 'Release output must never be the repository root.' }
$evidence = Assert-SafeChild -Parent $output -Child (Join-Path $repoRoot $gate.artifacts.evidenceDirectory) -Label 'Release evidence'
$iconPath = Assert-SafeChild -Parent $repoRoot -Child (Join-Path $repoRoot $gate.application.windowsIcon) -Label 'Application icon'

$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') { throw 'Cannot resolve the current Git commit.' }
$trackedStatus = (& git -C $repoRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked working-tree state.' }
if ($trackedStatus) { throw 'Refusing a release build from tracked changes that are not committed.' }
$env:RELEASE_COMMIT_SHA = $head

$nodeVersion = (& node.exe --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne [string]$gate.node.version) {
    throw "Release build requires exactly $($gate.node.version); active node is $nodeVersion."
}

& node.exe (Join-Path $repoRoot 'tools\release\generate-icons.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'The committed logo/icon family is stale or invalid.' }

if (Test-Path -LiteralPath $output) {
    $verifiedOutput = Assert-SafeChild -Parent $repoRoot -Child $output -Label 'Release output before cleanup'
    Remove-Item -LiteralPath $verifiedOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $output | Out-Null

$started = [DateTime]::UtcNow
$logTemporary = Join-Path ([System.IO.Path]::GetTempPath()) ('meadowmark-build-' + [Guid]::NewGuid().ToString('N') + '.log')
$buildExit = 1
try {
    Push-Location $repoRoot
    try {
        $priorPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & npm.cmd run dist 2>&1 | Tee-Object -FilePath $logTemporary
        $buildExit = $LASTEXITCODE
        $ErrorActionPreference = $priorPreference
    } finally { Pop-Location }

    New-Item -ItemType Directory -Path $evidence -Force | Out-Null
    Copy-Item -LiteralPath $logTemporary -Destination (Join-Path $evidence 'build.log') -Force
    if ($buildExit -ne 0) { throw "npm run dist failed with exit code $buildExit." }

    $setupName = ([string]$gate.artifacts.setupPattern).Replace('{version}', $version)
    $fullPattern = ([string]$gate.artifacts.fullPackagePattern).Replace('{version}', $version)
    $setupMatches = @(Get-ChildItem -LiteralPath $output -Recurse -File -Filter $setupName)
    $releaseMatches = @(Get-ChildItem -LiteralPath $output -Recurse -File -Filter ([string]$gate.artifacts.releaseIndex))
    $nupkgMatches = @(Get-ChildItem -LiteralPath $output -Recurse -File -Filter $fullPattern)
    if ($setupMatches.Count -ne 1) { throw "Expected exactly one $setupName; found $($setupMatches.Count)." }
    if ($releaseMatches.Count -ne 1) { throw "Expected exactly one RELEASES index; found $($releaseMatches.Count)." }
    if ($nupkgMatches.Count -ne 1) { throw "Expected exactly one full package matching $fullPattern; found $($nupkgMatches.Count)." }
    $setup = $setupMatches[0]
    $releasesFile = $releaseMatches[0]
    $nupkg = $nupkgMatches[0]
    foreach ($artifact in @($setup, $releasesFile, $nupkg)) {
        if ($artifact.Length -le 0 -or $artifact.LastWriteTimeUtc -lt $started.AddSeconds(-2)) {
            throw "Artifact is empty or predates this build: $($artifact.FullName)"
        }
    }
    if ($setup.Length -lt 1MB) { throw "Setup executable is implausibly small: $($setup.Length) bytes." }

    $indexLines = @(Get-Content -LiteralPath $releasesFile.FullName | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $fullLine = @($indexLines | Where-Object { $_ -match [regex]::Escape($nupkg.Name) })
    if ($fullLine.Count -ne 1) { throw "RELEASES does not reference $($nupkg.Name) exactly once." }
    $columns = $fullLine[0] -split '\s+'
    if ($columns.Count -lt 3 -or $columns[0] -notmatch '^[0-9A-Fa-f]{40}$' -or $columns[1] -ne $nupkg.Name -or [int64]$columns[2] -ne $nupkg.Length) {
        throw 'The full-package RELEASES entry has invalid hash, filename, or size metadata.'
    }
    $nupkgSha1 = Get-HashHex -Path $nupkg.FullName -Algorithm SHA1
    if ($nupkgSha1 -ne $columns[0].ToLowerInvariant()) { throw 'RELEASES SHA-1 does not match the full package.' }

    # Prove the setup executable is unsigned. This is a policy gate, never a
    # formality, so it fails closed: a signature we cannot READ stops the build,
    # rather than being treated as "not signed".
    #
    # Deliberately NOT Get-AuthenticodeSignature. Microsoft.PowerShell.Security
    # fails to load on this machine under both PowerShell 7 and Windows
    # PowerShell 5.1 ("found in the module ... but the module could not be
    # loaded"), which killed the release at its final check. The .NET call below
    # reads the embedded Authenticode certificate directly and needs no module:
    # it RETURNS a certificate for a signed file, and throws a
    # CryptographicException for a file that carries no signature at all.
    $setupIsSigned = $null
    try {
        $null = [System.Security.Cryptography.X509Certificates.X509Certificate]::CreateFromSignedFile($setup.FullName)
        $setupIsSigned = $true
    } catch [System.Security.Cryptography.CryptographicException] {
        $setupIsSigned = $false
    } catch {
        throw "Could not determine the setup executable signature state: $($_.Exception.Message)"
    }
    if ($null -eq $setupIsSigned) {
        throw 'Could not determine the setup executable signature state; refusing to claim it is unsigned.'
    }
    if ($setupIsSigned) {
        throw 'Setup executable must be unsigned, but it carries an Authenticode certificate.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('meadowmark-nupkg-' + [Guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Path $extractRoot | Out-Null
        [System.IO.Compression.ZipFile]::ExtractToDirectory($nupkg.FullName, $extractRoot)
        $nuspecFiles = @(Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter '*.nuspec')
        if ($nuspecFiles.Count -ne 1) { throw "Expected one nuspec in the full package; found $($nuspecFiles.Count)." }
        [xml]$nuspec = Get-Content -LiteralPath $nuspecFiles[0].FullName -Raw
        $metadata = $nuspec.package.metadata
        if ([string]$metadata.version -ne $version) { throw "Package nuspec version $($metadata.version) does not match $version." }
        $expectedIconUrl = "https://raw.githubusercontent.com/Ding-Ding-Projects/meadowmark/$head/design/icons/meadowmark.ico"
        if ([string]$metadata.iconUrl -ne $expectedIconUrl) { throw "Package icon URL is not pinned to the built commit: $($metadata.iconUrl)" }

        $asarFiles = @(Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter 'app.asar')
        if ($asarFiles.Count -ne 1) { throw "Expected one app.asar in the full package; found $($asarFiles.Count)." }
        $packagedMetadata = & node.exe (Join-Path $repoRoot 'tools\release\inspect-asar-package.mjs') $asarFiles[0].FullName $version $head
        if ($LASTEXITCODE -ne 0) { throw 'Packaged app metadata failed version/commit provenance validation.' }

        $applicationExecutables = @(Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter "$productName.exe")
        if ($applicationExecutables.Count -ne 1) { throw "Expected one packaged $productName.exe; found $($applicationExecutables.Count)." }
        $appIcon = & (Join-Path $repoRoot 'tools\release\verify-pe-icon.ps1') -Executable $applicationExecutables[0].FullName -ReferenceIcon $iconPath -RequireReferenceMatch
        $setupIcon = & (Join-Path $repoRoot 'tools\release\verify-pe-icon.ps1') -Executable $setup.FullName -ReferenceIcon $iconPath -RequireReferenceMatch
    } finally {
        $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        $resolvedExtract = [System.IO.Path]::GetFullPath($extractRoot)
        if ($resolvedExtract.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedExtract)) {
            Remove-Item -LiteralPath $resolvedExtract -Recurse -Force
        }
    }

    $publishStage = Join-Path $output ('.publish-stage-' + [Guid]::NewGuid().ToString('N'))
    $publish = Join-Path $output 'publish'
    New-Item -ItemType Directory -Path $publishStage | Out-Null
    Copy-Item -LiteralPath $setup.FullName -Destination (Join-Path $publishStage $setup.Name)
    Copy-Item -LiteralPath $releasesFile.FullName -Destination (Join-Path $publishStage $releasesFile.Name)
    Copy-Item -LiteralPath $nupkg.FullName -Destination (Join-Path $publishStage $nupkg.Name)
    if (Test-Path -LiteralPath $publish) { throw 'Fresh release output unexpectedly already contains a publish directory.' }
    Move-WithRetry -Source $publishStage -Destination $publish

    $completed = [DateTime]::UtcNow
    $artifactRecords = foreach ($file in Get-ChildItem -LiteralPath $publish -File | Sort-Object Name) {
        [ordered]@{ name = $file.Name; size = $file.Length; sha256 = Get-HashHex -Path $file.FullName -Algorithm SHA256 }
    }
    $iconEntries = & node.exe (Join-Path $repoRoot 'tools\release\verify-icon.mjs') --icon $iconPath
    if ($LASTEXITCODE -ne 0) { throw 'Committed icon failed final validation.' }
    $manifest = [ordered]@{
        schemaVersion = 1
        product = $productName
        version = $version
        commit = $head
        nodeVersion = $nodeVersion
        buildStartedUtc = $started.ToString('o')
        buildCompletedUtc = $completed.ToString('o')
        unsigned = $true
        setupSignatureStatus = [string]$setupSignature.Status
        packageSha1 = $nupkgSha1
        iconSha256 = Get-HashHex -Path $iconPath -Algorithm SHA256
        iconValidation = [string]$iconEntries
        packagedMetadata = ($packagedMetadata | ConvertFrom-Json)
        applicationIcon = $appIcon
        installerIcon = $setupIcon
        artifacts = @($artifactRecords)
    }
    Write-AtomicText -Path (Join-Path $evidence 'release-evidence.json') -Value ($manifest | ConvertTo-Json -Depth 8)
    $hashLines = $artifactRecords | ForEach-Object { "$($_.sha256)  $($_.name)" }
    Write-AtomicText -Path (Join-Path $evidence 'SHA256SUMS.txt') -Value (($hashLines -join [Environment]::NewLine) + [Environment]::NewLine)

    Write-Host "[build-installer] Verified unsigned Squirrel.Windows release for commit $head."
    foreach ($record in $artifactRecords) { Write-Host "[build-installer] $($record.sha256)  $($record.name) ($($record.size) bytes)" }
    Write-Host "[build-installer] Publish directory: $publish"
    Write-Host '[build-installer] Windows may show an unknown-publisher or SmartScreen warning; this is expected.'
} finally {
    if (Test-Path -LiteralPath $logTemporary) { Remove-Item -LiteralPath $logTemporary -Force }
}
