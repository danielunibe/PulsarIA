[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeBundle,
    [string]$ProjectRoot,
    [switch]$SkipManifest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
} else {
    $ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}
$RuntimeBundle = [System.IO.Path]::GetFullPath($RuntimeBundle)
if (-not (Test-Path -LiteralPath $RuntimeBundle -PathType Container)) {
    throw "External runtime bundle not found: $RuntimeBundle"
}

$runtimeRoot = Join-Path $ProjectRoot 'src-tauri/resources'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$requiredDirectories = @('python', 'assets/models', 'bin')
foreach ($relative in $requiredDirectories) {
    $source = Join-Path $RuntimeBundle $relative
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "External runtime bundle is missing required directory: $relative"
    }
    $destination = Join-Path $runtimeRoot $relative
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
}

$license = Join-Path $RuntimeBundle 'bin/FFMPEG-LICENSE.txt'
if (-not (Test-Path -LiteralPath $license -PathType Leaf)) {
    throw 'External runtime bundle must include bin/FFMPEG-LICENSE.txt'
}

$env:PULSAR_RUNTIME_ROOT = $runtimeRoot
if (-not $SkipManifest) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot 'scripts/generate-runtime-manifest.ps1') `
        -ProjectRoot $ProjectRoot -ResourceRoot $runtimeRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

[ordered]@{
    status = 'PASS'
    runtimeRoot = $runtimeRoot
    externalBundle = $RuntimeBundle
    policy = 'Runtime binaries, Python and models remain external artifacts and are never committed.'
} | ConvertTo-Json -Depth 5
Write-Host "PULSARIA RUNTIME PREPARATION: PASS ($runtimeRoot)"
