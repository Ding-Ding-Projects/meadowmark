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

$large = [IntPtr]::Zero
$small = [IntPtr]::Zero
$count = [MeadowmarkIconNative]::ExtractIconEx($Executable, 0, [ref]$large, [ref]$small, 1)
# ExtractIconEx returns the number of icon HANDLES it filled, not the number of
# pairs requested: asking for one pair yields two handles (large and small) on
# this platform. The old assertion demanded exactly 1 and therefore rejected
# every correctly-iconned executable -- verified against notepad.exe, which also
# returns 2 and would also have failed. What actually matters is that BOTH
# handles came back, so that is what is checked.
if ($count -lt 1 -or $large -eq [IntPtr]::Zero -or $small -eq [IntPtr]::Zero) {
    throw "No complete large/small icon pair was embedded in $Executable."
}
try {
    $largeIcon = [System.Drawing.Icon]::FromHandle($large)
    $smallIcon = [System.Drawing.Icon]::FromHandle($small)
    $largeBitmap = $largeIcon.ToBitmap()
    $smallBitmap = $smallIcon.ToBitmap()
    try {
        $largeHash = Get-PixelHash -Bitmap $largeBitmap
        $smallHash = Get-PixelHash -Bitmap $smallBitmap
        if ($largeHash -eq $smallHash) { throw "Large and small embedded icons in $Executable collapse to one identical frame." }
        if ($RequireReferenceMatch) {
            # Compare against EVERY frame in the committed .ico, not one guessed
            # size.
            #
            # new Icon(path, 32, 32) asks Windows for the best match at that size,
            # and which frame it returns is environment-dependent: the identical
            # file hashed f96fcce0 when this script ran standalone and f6b5e25b
            # when the release build ran it, against an executable whose icon was
            # provably pixel-identical to the file (0 differing pixels of 1024,
            # measured on the unpacked exe, the nupkg copy and Setup.exe).
            #
            # Requiring a match with ANY committed frame still proves the embedded
            # icon came from this icon family, and drops an ambiguity that is not
            # ours to control.
            $referenceHashes = @()
            foreach ($size in @(16, 20, 24, 32, 40, 48, 64, 128, 256)) {
                try {
                    $frame = New-Object System.Drawing.Icon $ReferenceIcon, $size, $size
                    try {
                        $frameBitmap = $frame.ToBitmap()
                        try { $referenceHashes += (Get-PixelHash -Bitmap $frameBitmap) } finally { $frameBitmap.Dispose() }
                    } finally { $frame.Dispose() }
                } catch { }
            }
            if ($referenceHashes.Count -eq 0) {
                throw "Could not read any frame from the committed icon $ReferenceIcon; refusing to claim a match."
            }
            if ($referenceHashes -notcontains $largeHash) {
                throw "The packaged application icon does not match any frame of the committed Meadowmark icon. executable=$Executable reference=$ReferenceIcon largeHash=$largeHash frames=$($referenceHashes.Count)"
            }
        }
        [pscustomobject]@{ executable = $Executable; largePixelHash = $largeHash; smallPixelHash = $smallHash; referenceMatched = [bool]$RequireReferenceMatch }
    } finally {
        $largeBitmap.Dispose()
        $smallBitmap.Dispose()
    }
} finally {
    [MeadowmarkIconNative]::DestroyIcon($large) | Out-Null
    [MeadowmarkIconNative]::DestroyIcon($small) | Out-Null
}
