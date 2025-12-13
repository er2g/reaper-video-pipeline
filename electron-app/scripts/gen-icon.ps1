$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "build"
$outIco = Join-Path $buildDir "icon.ico"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport("user32.dll", SetLastError=true)] public static extern bool DestroyIcon(IntPtr hIcon);'

$bmp = New-Object System.Drawing.Bitmap 256,256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(18,18,22))

$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 200, 255))
$g.FillEllipse($accent, 16, 16, 224, 224)

$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font("Segoe UI", 88, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("RV", $font, $textBrush, 46, 66)

$g.Dispose()
$hicon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hicon)

$fs = [System.IO.File]::Open($outIco, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$icon.Save($fs)
$fs.Close()

[Win32.NativeMethods]::DestroyIcon($hicon) | Out-Null
$bmp.Dispose()

Write-Host "Wrote $outIco"

