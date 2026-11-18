# ANES Browser Agent — eklenti simgelerini üretir (16/32/48/128 PNG).
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-AnesIcon([int]$size) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1.0, $size * 0.045)
    $r = [Math]::Max(2.0, $size * 0.22)
    $w = [float]($size - 2 * $pad)
    $rect = [System.Drawing.RectangleF]::new([float]$pad, [float]$pad, $w, $w)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = [float]($r * 2)
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $bg = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 22, 27, 34))
    $g.FillPath($bg, $path)
    $edgeW = [float][Math]::Max(1.0, $size / 48.0)
    $penEdge = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 55, 64, 76), $edgeW)
    $g.DrawPath($penEdge, $path)

    $cx = [float]($size / 2.0)
    $cy = [float]($size / 2.0)
    $cr = [float]($size * 0.30)
    $penW = [float][Math]::Max(1.0, $size / 22.0)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 235, 240, 246), $penW)
    $g.DrawEllipse($pen, $cx - $cr, $cy - $cr, $cr * 2, $cr * 2)
    $g.DrawLine($pen, $cx - $cr, $cy, $cx + $cr, $cy)
    $g.DrawEllipse($pen, $cx - $cr * 0.48, $cy - $cr, $cr * 0.96, $cr * 2)

    $g.Dispose()
    $path.Dispose()
    $bg.Dispose()
    $pen.Dispose()
    $penEdge.Dispose()

    $file = Join-Path $out ("icon{0}.png" -f $size)
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $file"
}

foreach ($s in 16, 32, 48, 128) { New-AnesIcon $s }
