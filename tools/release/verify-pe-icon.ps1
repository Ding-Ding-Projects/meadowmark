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
    # Hash the ARGB values directly rather than normalising through
    # Graphics.DrawImage and hashing the locked byte buffer.
    #
    # The DrawImage route reported a mismatch between the icon embedded in the
    # packaged executable and the committed one when a direct pixel comparison
    # of the very same two images found 0 differing pixels out of 1024. Source
    # bitmaps arrive with different PixelFormats, and the redraw plus locked
    # buffer (including stride padding) is not stable across them. Reading the
    # pixels is slower and says what it means.
    $sha = [Security.Cryptography.SHA256]::Create()
    $bytes = New-Object byte[] (32 * 32 * 4)
    $index = 0
    for ($y = 0; $y -lt 32; $y++) {
        for ($x = 0; $x -lt 32; $x++) {
            $sampleX = [Math]::Min($x, $Bitmap.Width - 1)
            $sampleY = [Math]::Min($y, $Bitmap.Height - 1)
            $pixel = $Bitmap.GetPixel($sampleX, $sampleY)
            $bytes[$index++] = $pixel.A
            $bytes[$index++] = $pixel.R
            $bytes[$index++] = $pixel.G
            $bytes[$index++] = $pixel.B
        }
    }
    return ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
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
            $reference = New-Object System.Drawing.Icon $ReferenceIcon, 32, 32
            try {
                $referenceBitmap = $reference.ToBitmap()
                try { $referenceHash = Get-PixelHash -Bitmap $referenceBitmap } finally { $referenceBitmap.Dispose() }
            } finally { $reference.Dispose() }
            if ($largeHash -ne $referenceHash) { throw "The packaged application icon does not match the committed Meadowmark icon." }
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
