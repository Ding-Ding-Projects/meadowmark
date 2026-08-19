param([switch]$Silent, [string]$VerifyUnsignedExecutable)

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
$baseVersion = [string]$package.version
$version = if ([string]::IsNullOrWhiteSpace($env:RELEASE_BUILD_VERSION)) { $baseVersion } else { $env:RELEASE_BUILD_VERSION.Trim() }
if ($baseVersion -notmatch '^\d+\.\d+\.\d+$' -or $version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Base and release build versions must both be stable three-part semantic versions. base=$baseVersion release=$version"
}

function Get-PeCertificateTableState {
    param([string]$Path)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $reader = [System.IO.BinaryReader]::new($stream)
        try {
            if ($stream.Length -lt 64) { throw 'PE file is shorter than the DOS header.' }
            $stream.Position = 0
            if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'PE file does not begin with the MZ signature.' }
            $stream.Position = 0x3C
            $peOffset = [int64]$reader.ReadUInt32()
            if ($peOffset -lt 64 -or $peOffset -gt ($stream.Length - 24)) { throw 'PE header offset is outside the file.' }
            $stream.Position = $peOffset
            if ($reader.ReadUInt32() -ne 0x00004550) { throw 'PE signature is missing.' }
            $stream.Position = $peOffset + 20
            $optionalHeaderSize = [int]$reader.ReadUInt16()
            $optionalHeaderOffset = $peOffset + 24
            if ($optionalHeaderSize -lt 2 -or ($optionalHeaderOffset + $optionalHeaderSize) -gt $stream.Length) {
                throw 'PE optional header is truncated.'
            }
            $stream.Position = $optionalHeaderOffset
            $magic = $reader.ReadUInt16()
            if ($magic -eq 0x10B) {
                $numberOfDirectoriesOffset = 92
                $dataDirectoriesOffset = 96
            } elseif ($magic -eq 0x20B) {
                $numberOfDirectoriesOffset = 108
                $dataDirectoriesOffset = 112
            } else {
                throw ("Unsupported PE optional-header magic: 0x{0:x4}." -f $magic)
            }
            if ($optionalHeaderSize -lt ($numberOfDirectoriesOffset + 4)) { throw 'PE optional header omits NumberOfRvaAndSizes.' }
            $stream.Position = $optionalHeaderOffset + $numberOfDirectoriesOffset
            $directoryCount = [uint32]$reader.ReadUInt32()
            if ($directoryCount -le 4) { return 'NotSigned' }
            $securityEntryOffset = $optionalHeaderOffset + $dataDirectoriesOffset + (4 * 8)
            if ($optionalHeaderSize -lt (($securityEntryOffset - $optionalHeaderOffset) + 8)) {
                throw 'PE optional header claims a security directory but does not contain its entry.'
            }
            $stream.Position = $securityEntryOffset
            $certificateOffset = [uint64]$reader.ReadUInt32()
            $certificateSize = [uint64]$reader.ReadUInt32()
            if ($certificateOffset -eq 0 -and $certificateSize -eq 0) { return 'NotSigned' }
            if ($certificateOffset -eq 0 -or $certificateSize -lt 8 -or ($certificateOffset % 8) -ne 0) {
                throw 'PE certificate-table metadata is malformed.'
            }
            if (($certificateOffset + $certificateSize) -gt [uint64]$stream.Length) {
                throw 'PE certificate table extends beyond the file.'
            }
            return 'CertificateTablePresent'
        } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
}

if (-not [string]::IsNullOrWhiteSpace($VerifyUnsignedExecutable)) {
    $signatureState = Get-PeCertificateTableState -Path ([System.IO.Path]::GetFullPath($VerifyUnsignedExecutable))
    if ($signatureState -ne 'NotSigned') { throw "Executable is not unsigned: $signatureState" }
    [pscustomobject]@{ executable = [System.IO.Path]::GetFullPath($VerifyUnsignedExecutable); signatureStatus = $signatureState }
    return
}
$baseParts = $baseVersion.Split('.')
$releaseParts = $version.Split('.')
if ($releaseParts[0] -ne $baseParts[0] -or $releaseParts[1] -ne $baseParts[1]) {
    throw "RELEASE_BUILD_VERSION may change only the patch component. base=$baseVersion release=$version"
}
if (-not [string]::IsNullOrWhiteSpace($env:RELEASE_BUILD_VERSION) -and [int64]$baseParts[2] -ne 0) {
    throw 'A release build override requires the committed base patch to be 0.'
}
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
        # electron-builder does NOT expand ${env.*} inside squirrelWindows.iconUrl,
        # so the raw macro reached the generated nuspec and the pinned-icon check
        # rejected it. Build the workspace, then invoke electron-builder directly
        # with the URL resolved against the commit actually being built. npm run
        # dist stays the human entry point; the release path needs the pin.
        $iconUrl = "https://raw.githubusercontent.com/Ding-Ding-Projects/meadowmark/$head/design/icons/meadowmark.ico"
        & npm.cmd run build 2>&1 | Tee-Object -FilePath $logTemporary
        $buildExit = $LASTEXITCODE
        if ($buildExit -eq 0) {
            # extraMetadata does not expand ${env.*} either -- the literal string was
            # landing in the packaged package.json, so provenance validation saw a
            # missing commit. Both values are passed as real overrides instead.
            & npx.cmd electron-builder --win squirrel "-c.squirrelWindows.iconUrl=$iconUrl" "-c.extraMetadata.releaseCommit=$head" "-c.extraMetadata.version=$version" 2>&1 | Tee-Object -FilePath $logTemporary -Append
            $buildExit = $LASTEXITCODE
        }
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

    # The PE security data-directory entry is the authoritative on-disk signal.
    # Both offset and size must be zero before the build may claim NotSigned.
    # Any certificate table or malformed/truncated metadata fails closed.
    $setupSignatureStatus = Get-PeCertificateTableState -Path $setup.FullName
    if ($setupSignatureStatus -ne 'NotSigned') {
        throw "Setup executable must be unsigned, but its PE state is $setupSignatureStatus."
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
        baseVersion = $baseVersion
        version = $version
        commit = $head
        nodeVersion = $nodeVersion
        buildStartedUtc = $started.ToString('o')
        buildCompletedUtc = $completed.ToString('o')
        unsigned = $true
        setupSignatureStatus = $setupSignatureStatus
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
