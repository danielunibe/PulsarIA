[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
} else {
    $ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}
Set-Location -LiteralPath $ProjectRoot

function Read-JsonFile([string]$RelativePath) {
    return Get-Content -LiteralPath (Join-Path $ProjectRoot $RelativePath) -Raw | ConvertFrom-Json
}

$package = Read-JsonFile 'package.json'
$packageLockRaw = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Raw
$tauri = Read-JsonFile 'src-tauri/tauri.conf.json'
$projectManifest = Read-JsonFile 'PROJECT.manifest.json'
$runtimeManifest = Read-JsonFile 'src-tauri/resources/runtime-manifest.json'
$cargoToml = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/Cargo.toml') -Raw
$cargoLock = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/Cargo.lock') -Raw

$cargoPackageMatch = [regex]::Match($cargoToml, '(?ms)^\[package\].*?^version\s*=\s*"([^"]+)"')
$cargoLockPackageMatch = [regex]::Match($cargoLock, '(?ms)^\[\[package\]\]\s*\r?\nname\s*=\s*"pulsaria"\s*\r?\nversion\s*=\s*"([^"]+)"')
$packageLockVersionMatch = [regex]::Match($packageLockRaw, '(?ms)^\s*"version"\s*:\s*"([^"]+)"\s*,\s*\r?\n\s*"lockfileVersion"')
$packageLockRootVersionMatch = [regex]::Match($packageLockRaw, '(?ms)"packages"\s*:\s*\{\s*""\s*:\s*\{.*?^\s*"version"\s*:\s*"([^"]+)"')
$packageLockVersion = if ($packageLockVersionMatch.Success) { $packageLockVersionMatch.Groups[1].Value } else { '' }
$packageLockRootVersion = if ($packageLockRootVersionMatch.Success) { $packageLockRootVersionMatch.Groups[1].Value } else { '' }
$canonicalVersion = [string]$package.version

$checks = [ordered]@{
    'package.json' = $canonicalVersion
    'package-lock.json' = $packageLockVersion
    'package-lock.json packages[""]' = $packageLockRootVersion
    'PROJECT.manifest.json' = [string]$projectManifest.version
    'src-tauri/tauri.conf.json' = [string]$tauri.version
    'src-tauri/Cargo.toml' = if ($cargoPackageMatch.Success) { $cargoPackageMatch.Groups[1].Value } else { '' }
    'src-tauri/Cargo.lock' = if ($cargoLockPackageMatch.Success) { $cargoLockPackageMatch.Groups[1].Value } else { '' }
    'src-tauri/resources/runtime-manifest.json' = [string]$runtimeManifest.version
}

$mismatches = @(
    $checks.GetEnumerator() | Where-Object { [string]$_.Value -ne $canonicalVersion } | ForEach-Object {
        "$($_.Key)=$($_.Value) (expected $canonicalVersion)"
    }
)

$status = if ($mismatches.Count -eq 0) { 'PASS' } else { 'FAIL' }
[ordered]@{
    status = $status
    canonicalVersion = $canonicalVersion
    checks = $checks
    mismatches = @($mismatches)
} | ConvertTo-Json -Depth 6

if ($status -ne 'PASS') {
    Write-Error "PULSARIA VERSION CONTRACT: FAIL ($($mismatches.Count) mismatch(es))"
    exit 1
}
Write-Host "PULSARIA VERSION CONTRACT: PASS ($canonicalVersion)"
