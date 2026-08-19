param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$ReferenceIcon,
    [switch]$RequireReferenceMatch
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MeadowmarkIconNative {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern uint ExtractIconEx(string file, int index, out IntPtr large, out IntPtr small, uint count);
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr handle);
}
'@

function Get-PixelHash {
    param([System.Drawing.Bitmap]$Bitmap)
    # Scale to a fixed 32x32 and hash the ARGB values read back pixel by pixel.
    #
    # Two things were wrong here in turn. The original hashed the LOCKED BYTE
    # BUFFER of a redrawn bitmap, which is not stable across source PixelFormats
    # and reported a mismatch for two images with 0 differing pixels out of 1024.
    # The first replacement read pixels directly but CLAMPED coordinates instead
    # of scaling, so a large icon bigger than 32x32 had its top-left corner
    # sampled against a fully scaled reference -- same false mismatch, new cause.
    # Scaling and then reading pixels is what actually compares like with like.
    $normalized = New-Object System.Drawing.Bitmap 32, 32, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($normalized)
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.DrawImage($Bitmap, 0, 0, 32, 32)
        } finally { $graphics.Dispose() }
        $bytes = New-Object byte[] (32 * 32 * 4)
        $index = 0
        for ($y = 0; $y -lt 32; $y++) {
            for ($x = 0; $x -lt 32; $x++) {
                $pixel = $normalized.GetPixel($x, $y)
                $bytes[$index++] = $pixel.A
                $bytes[$index++] = $pixel.R
                $bytes[$index++] = $pixel.G
                $bytes[$index++] = $pixel.B
            }
        }
        return ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    } finally { $normalized.Dispose() }
}

function Get-HandlePixelHash {
    param([IntPtr]$Handle)
    if ($Handle -eq [IntPtr]::Zero) { throw 'Cannot hash an empty icon handle.' }
    $icon = [System.Drawing.Icon]::FromHandle($Handle)
    try {
        $bitmap = $icon.ToBitmap()
        try { return Get-PixelHash -Bitmap $bitmap }
        finally { $bitmap.Dispose() }
    } finally { $icon.Dispose() }
}

$large = [IntPtr]::Zero
$small = [IntPtr]::Zero
$count = 0
try {
    $count = [MeadowmarkIconNative]::ExtractIconEx($Executable, 0, [ref]$large, [ref]$small, 1)
    if ($count -lt 1 -or $large -eq [IntPtr]::Zero -or $small -eq [IntPtr]::Zero) {
        throw "No complete large/small icon pair was embedded in $Executable."
    }
    $largeHash = Get-HandlePixelHash -Handle $large
    $smallHash = Get-HandlePixelHash -Handle $small

    if ($RequireReferenceMatch) {
        # Extract the executable and committed .ico through the same Windows API.
        # Matching each large/small result to its corresponding reference avoids
        # environment-dependent frame selection by System.Drawing.Icon(path,size).
        $referenceLarge = [IntPtr]::Zero
        $referenceSmall = [IntPtr]::Zero
        $referenceCount = 0
        try {
            $referenceCount = [MeadowmarkIconNative]::ExtractIconEx($ReferenceIcon, 0, [ref]$referenceLarge, [ref]$referenceSmall, 1)
            if ($referenceCount -lt 1 -or $referenceLarge -eq [IntPtr]::Zero -or $referenceSmall -eq [IntPtr]::Zero) {
                throw "No complete large/small icon pair could be extracted from $ReferenceIcon."
            }
            $referenceLargeHash = Get-HandlePixelHash -Handle $referenceLarge
            $referenceSmallHash = Get-HandlePixelHash -Handle $referenceSmall
            if ($largeHash -ne $referenceLargeHash -or $smallHash -ne $referenceSmallHash) {
                throw "The packaged icon pair does not match the committed Meadowmark icon. executable=$Executable reference=$ReferenceIcon largeHash=$largeHash referenceLargeHash=$referenceLargeHash smallHash=$smallHash referenceSmallHash=$referenceSmallHash"
            }
        } finally {
            if ($referenceLarge -ne [IntPtr]::Zero) { [MeadowmarkIconNative]::DestroyIcon($referenceLarge) | Out-Null }
            if ($referenceSmall -ne [IntPtr]::Zero) { [MeadowmarkIconNative]::DestroyIcon($referenceSmall) | Out-Null }
        }
    }

    [pscustomobject]@{ executable = $Executable; largePixelHash = $largeHash; smallPixelHash = $smallHash; referenceMatched = [bool]$RequireReferenceMatch }
} finally {
    if ($large -ne [IntPtr]::Zero) { [MeadowmarkIconNative]::DestroyIcon($large) | Out-Null }
    if ($small -ne [IntPtr]::Zero) { [MeadowmarkIconNative]::DestroyIcon($small) | Out-Null }
}
