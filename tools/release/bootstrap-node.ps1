param(
    [Parameter(Mandatory = $true)]
    [string]$ResultPath
)

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
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $temporary = Join-Path $parent ('.' + [System.IO.Path]::GetFileName($Path) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [System.IO.File]::WriteAllText($temporary, $Value, [System.Text.UTF8Encoding]::new($false))
        Move-WithRetry -Source $temporary -Destination $Path
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Get-HashHex {
    param([string]$Path, [ValidateSet('SHA256')][string]$Algorithm)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try { return (($hasher.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '') }
        finally { $hasher.Dispose() }
    } finally { $stream.Dispose() }
}

function Get-NodeIdentity {
    param([string]$Executable)
    try {
        $versionOutput = @(& $Executable --version 2>$null)
        $versionExit = $LASTEXITCODE
        $platformOutput = @(& $Executable -p process.platform 2>$null)
        $platformExit = $LASTEXITCODE
        $architectureOutput = @(& $Executable -p process.arch 2>$null)
        $architectureExit = $LASTEXITCODE
        if ($versionExit -ne 0 -or $platformExit -ne 0 -or $architectureExit -ne 0 -or
            $versionOutput.Count -ne 1 -or $platformOutput.Count -ne 1 -or $architectureOutput.Count -ne 1) {
            return $null
        }
        $version = [string]$versionOutput[0]
        $platform = [string]$platformOutput[0]
        $architecture = [string]$architectureOutput[0]
        if ([string]::IsNullOrWhiteSpace($version) -or [string]::IsNullOrWhiteSpace($platform) -or
            [string]::IsNullOrWhiteSpace($architecture)) {
            return $null
        }
        return [pscustomobject]@{
            Version = $version.Trim()
            Platform = $platform.Trim()
            Architecture = $architecture.Trim()
        }
    } catch {
        return $null
    }
}

function Get-ZipEntryHashHex {
    param([string]$ArchivePath, [string]$EntryName)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -eq $EntryName } | Select-Object -First 1
        if (-not $entry) { throw "Pinned Node archive is missing $EntryName." }
        $stream = $entry.Open()
        try {
            $hasher = [System.Security.Cryptography.SHA256]::Create()
            try { return (($hasher.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '') }
            finally { $hasher.Dispose() }
        } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$gate = Get-Content -LiteralPath (Join-Path $repoRoot 'release-gate.json') -Raw | ConvertFrom-Json
if ($gate.schemaVersion -ne 2) { throw 'release-gate.json has an unsupported schemaVersion.' }

$version = [string]$gate.node.version
$platform = [string]$gate.node.platform
$archiveUrl = [string]$gate.node.archiveUrl
$expectedHash = ([string]$gate.node.sha256).ToLowerInvariant()
$expectedName = "node-$version-$platform.zip"
if ($archiveUrl -ne "https://nodejs.org/dist/$version/$expectedName") {
    throw 'Node archive URL must be the canonical nodejs.org URL derived from the pinned version and platform.'
}
if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'Pinned Node SHA-256 is invalid.' }

$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($systemNode) {
    $identity = Get-NodeIdentity -Executable $systemNode.Source
    $systemNpm = Join-Path (Split-Path -Parent $systemNode.Source) 'npm.cmd'
    if ($identity -and $identity.Version -eq $version -and
        "$($identity.Platform)-$($identity.Architecture)" -eq 'win32-x64' -and
        (Test-Path -LiteralPath $systemNpm)) {
        Write-Host "[bootstrap-node] Using exact installed Node $($identity.Version) (win32-x64)."
        Write-AtomicText -Path $ResultPath -Value (Split-Path -Parent $systemNode.Source)
        exit 0
    }
    $description = if ($identity) { "$($identity.Version) ($($identity.Platform)-$($identity.Architecture))" } else { 'unusable or returned no identity' }
    Write-Host "[bootstrap-node] Installed Node is $description; release tooling requires exactly $version (win32-x64)."
}

$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
if ([string]::IsNullOrWhiteSpace($localAppData)) { throw 'Local application data directory is unavailable.' }
$toolRoot = Join-Path $localAppData 'Meadowmark\toolchains'
$downloadRoot = Join-Path $toolRoot 'downloads'
$installRoot = Join-Path $toolRoot $expectedName.Replace('.zip', '')
$nodeExe = Join-Path $installRoot 'node.exe'
$npmCmd = Join-Path $installRoot 'npm.cmd'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

$archivePath = Join-Path $downloadRoot $expectedName
if (Test-Path -LiteralPath $archivePath) {
    $cachedHash = Get-HashHex -Path $archivePath -Algorithm SHA256
    if ($cachedHash -ne $expectedHash) { Remove-Item -LiteralPath $archivePath -Force }
}

if (-not (Test-Path -LiteralPath $archivePath)) {
    $downloadTemporary = Join-Path $downloadRoot ('.' + $expectedName + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        Write-Host "[bootstrap-node] Downloading pinned Node $version from $archiveUrl."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -OutFile $downloadTemporary
        $downloadHash = Get-HashHex -Path $downloadTemporary -Algorithm SHA256
        if ($downloadHash -ne $expectedHash) {
            throw "Node archive SHA-256 mismatch. Expected $expectedHash, received $downloadHash."
        }
        Move-WithRetry -Source $downloadTemporary -Destination $archivePath
    } finally {
        if (Test-Path -LiteralPath $downloadTemporary) { Remove-Item -LiteralPath $downloadTemporary -Force }
    }
}

$archiveHash = Get-HashHex -Path $archivePath -Algorithm SHA256
if ($archiveHash -ne $expectedHash) { throw 'Cached Node archive did not retain its pinned SHA-256.' }

$archiveRoot = $expectedName.Replace('.zip', '')
if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
    $installedIdentity = Get-NodeIdentity -Executable $nodeExe
    $nodeMatches = (Get-HashHex -Path $nodeExe -Algorithm SHA256) -eq
        (Get-ZipEntryHashHex -ArchivePath $archivePath -EntryName "$archiveRoot/node.exe")
    $npmMatches = (Get-HashHex -Path $npmCmd -Algorithm SHA256) -eq
        (Get-ZipEntryHashHex -ArchivePath $archivePath -EntryName "$archiveRoot/npm.cmd")
    if ($installedIdentity -and $installedIdentity.Version -eq $version -and
        "$($installedIdentity.Platform)-$($installedIdentity.Architecture)" -eq 'win32-x64' -and
        $nodeMatches -and $npmMatches) {
        Write-Host "[bootstrap-node] Reusing digest-verified portable Node $version from $installRoot."
        Write-AtomicText -Path $ResultPath -Value $installRoot
        exit 0
    }
    throw "Portable Node directory failed archive-content or runtime-identity verification at $installRoot."
}
if (Test-Path -LiteralPath $installRoot) {
    throw "Portable Node directory is incomplete at $installRoot; refusing to replace an unexpected toolchain path."
}

$stageRoot = Join-Path $toolRoot ('.node-stage-' + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $stageRoot | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $stageRoot
    $expandedRoot = Join-Path $stageRoot $archiveRoot
    $expandedNode = Join-Path $expandedRoot 'node.exe'
    $expandedNpm = Join-Path $expandedRoot 'npm.cmd'
    if (-not (Test-Path -LiteralPath $expandedNode) -or -not (Test-Path -LiteralPath $expandedNpm)) {
        throw 'Pinned Node archive did not contain node.exe and npm.cmd at the declared root.'
    }
    $expandedIdentity = Get-NodeIdentity -Executable $expandedNode
    if (-not $expandedIdentity -or $expandedIdentity.Version -ne $version -or
        "$($expandedIdentity.Platform)-$($expandedIdentity.Architecture)" -ne 'win32-x64') {
        throw 'Expanded Node identity did not match the pinned win32-x64 runtime.'
    }
    if (Test-Path -LiteralPath $installRoot) { throw "Refusing to replace unexpected existing toolchain path $installRoot." }
    Move-WithRetry -Source $expandedRoot -Destination $installRoot
} finally {
    $resolvedToolRoot = [System.IO.Path]::GetFullPath($toolRoot).TrimEnd('\') + '\'
    $resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
    if ($resolvedStage.StartsWith($resolvedToolRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedStage)) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}

Write-Host "[bootstrap-node] Installed and verified portable Node $version at $installRoot."
Write-AtomicText -Path $ResultPath -Value $installRoot
