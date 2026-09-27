[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}

$source = 'C:\Users\danie\Downloads\icono pulsaria .png'
$publicIcon = Join-Path $ProjectRoot 'public\pulsaria-icon.png'
$iconRoot = Join-Path $ProjectRoot 'src-tauri\icons'
$required = @(
    'icon.png', 'icon.ico', 'icon.icns', '32x32.png', '64x64.png',
    '128x128.png', '128x128@2x.png', 'StoreLogo.png'
)
$errors = [System.Collections.Generic.List[string]]::new()

function Add-Error([string]$message) { $errors.Add($message) }
function Get-Sha256([string]$path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $stream = [IO.File]::OpenRead($path)
        try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
        finally { $stream.Dispose() }
    } finally { $sha.Dispose() }
}
function Read-PngSize([string]$path) {
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 24 -or $bytes[0] -ne 137 -or $bytes[1] -ne 80 -or $bytes[2] -ne 78 -or $bytes[3] -ne 71) {
        return $null
    }
    $width = ([uint32]$bytes[16] * 16777216) + ([uint32]$bytes[17] * 65536) + ([uint32]$bytes[18] * 256) + [uint32]$bytes[19]
    $height = ([uint32]$bytes[20] * 16777216) + ([uint32]$bytes[21] * 65536) + ([uint32]$bytes[22] * 256) + [uint32]$bytes[23]
    return @{ Width = $width; Height = $height }
}

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    Add-Error "Icon source is missing: $source"
} else {
    $sourceHash = Get-Sha256 $source
    if (-not (Test-Path -LiteralPath $publicIcon -PathType Leaf)) {
        Add-Error "Web icon is missing: $publicIcon"
    } else {
        $publicHash = Get-Sha256 $publicIcon
        if ($sourceHash -ne $publicHash) { Add-Error 'public/pulsaria-icon.png does not match the provided source PNG' }
    }
}

foreach ($name in $required) {
    $path = Join-Path $iconRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Error "Missing native icon asset: $name"
        continue
    }
    if ((Get-Item -LiteralPath $path).Length -eq 0) { Add-Error "Empty native icon asset: $name" }
}

$expected = @{
    'icon.png' = @(512, 512)
    '32x32.png' = @(32, 32)
    '64x64.png' = @(64, 64)
    '128x128.png' = @(128, 128)
    '128x128@2x.png' = @(256, 256)
}
foreach ($name in $expected.Keys) {
    $path = Join-Path $iconRoot $name
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $size = Read-PngSize $path
    if ($null -eq $size -or $size.Width -ne $expected[$name][0] -or $size.Height -ne $expected[$name][1]) {
        Add-Error "Unexpected dimensions for $name"
    }
}

$status = if ($errors.Count -eq 0) { 'PASS' } else { 'FAIL' }
[ordered]@{
    status = $status
    source = $source
    sourceHash = if (Test-Path -LiteralPath $source) { Get-Sha256 $source } else { $null }
    webIcon = $publicIcon
    nativeIconRoot = $iconRoot
    errors = @($errors)
} | ConvertTo-Json -Depth 5

if ($errors.Count -gt 0) { exit 1 }
