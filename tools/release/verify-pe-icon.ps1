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
    $normalized = New-Object System.Drawing.Bitmap 32, 32, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($normalized)
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.DrawImage($Bitmap, 0, 0, 32, 32)
        } finally { $graphics.Dispose() }
        $rectangle = New-Object System.Drawing.Rectangle 0, 0, 32, 32
        $data = $normalized.LockBits($rectangle, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $bytes = New-Object byte[] ([Math]::Abs($data.Stride) * $data.Height)
            [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
            return ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
        } finally { $normalized.UnlockBits($data) }
    } finally { $normalized.Dispose() }
}

$large = [IntPtr]::Zero
$small = [IntPtr]::Zero
$count = [MeadowmarkIconNative]::ExtractIconEx($Executable, 0, [ref]$large, [ref]$small, 1)
if ($count -ne 1 -or $large -eq [IntPtr]::Zero -or $small -eq [IntPtr]::Zero) {
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
