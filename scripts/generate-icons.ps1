Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot "..\apps\desktop\build"
[System.IO.Directory]::CreateDirectory($buildDir) | Out-Null

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Write-TapirIcon([int]$size, [string]$fileName) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $size / 512.0
  $graphics.ScaleTransform($scale, $scale)

  $background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 143, 174, 239))
  $body = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 35, 39, 45))
  $snout = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 167, 167))
  $eye = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 247, 248, 252))
  $pupil = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 19, 23))

  $rounded = New-RoundedRectanglePath 28 28 456 456 112
  $graphics.FillPath($background, $rounded)
  $graphics.FillEllipse($body, 110, 105, 285, 278)
  $graphics.FillRectangle($body, 134, 290, 54, 142)
  $graphics.FillRectangle($body, 280, 290, 54, 142)
  $graphics.FillPolygon($body, @(
    (New-Object System.Drawing.Point(157, 154)),
    (New-Object System.Drawing.Point(98, 87)),
    (New-Object System.Drawing.Point(91, 171))
  ))
  $graphics.FillPolygon($body, @(
    (New-Object System.Drawing.Point(333, 154)),
    (New-Object System.Drawing.Point(398, 88)),
    (New-Object System.Drawing.Point(397, 177))
  ))
  $graphics.FillEllipse($snout, 286, 178, 147, 136)
  $graphics.FillEllipse($body, 348, 255, 108, 70)
  $graphics.FillEllipse($eye, 310, 190, 22, 22)
  $graphics.FillEllipse($pupil, 317, 197, 10, 10)

  $bitmap.Save((Join-Path $buildDir $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
  $rounded.Dispose()
  $background.Dispose()
  $body.Dispose()
  $snout.Dispose()
  $eye.Dispose()
  $pupil.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Write-TapirWindowsIcon([string]$fileName) {
  $source = [System.Drawing.Image]::FromFile((Join-Path $buildDir "icon.png"))
  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  $images = @()

  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $size, $size)
    $memory = New-Object System.IO.MemoryStream
    $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
    $images += ,@($size, $memory.ToArray())
    $memory.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  $source.Dispose()

  $stream = [System.IO.File]::Create((Join-Path $buildDir $fileName))
  $writer = New-Object System.IO.BinaryWriter($stream)
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$images.Count)
  $offset = 6 + (16 * $images.Count)

  foreach ($image in $images) {
    $size = [int]$image[0]
    $bytes = [byte[]]$image[1]
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $bytes.Length
  }

  foreach ($image in $images) {
    $writer.Write([byte[]]$image[1])
  }
  $writer.Dispose()
  $stream.Dispose()
}

Write-TapirIcon 512 "icon.png"
Write-TapirIcon 32 "tray-icon.png"
Write-TapirWindowsIcon "icon.ico"
