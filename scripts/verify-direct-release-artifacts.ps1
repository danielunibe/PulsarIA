[CmdletBinding()]
param(
    [string]$ArtifactRoot,
    [Parameter(Mandatory = $true)]
    [string]$ReleaseVersion
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
    $ArtifactRoot = Join-Path ((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path) 'target-tauri/release/direct-assets'
}
$resolvedArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath $resolvedArtifactRoot -PathType Container)) {
    throw "Direct release asset directory not found: $resolvedArtifactRoot"
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeGate = Join-Path $projectRoot 'scripts/verify-runtime-manifest.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeGate
if ($LASTEXITCODE -ne 0) { throw 'Direct release is blocked because the runtime manifest is not PASS.' }

$installerName = "Pulsaria_${ReleaseVersion}_x64-setup.exe"
$installerPath = Join-Path $resolvedArtifactRoot $installerName
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Versioned NSIS installer not found: $installerName"
}
$requiredAssets = @(
    $installerName,
    'pulsaria-release.spdx.json',
    'THIRD_PARTY_NOTICES.md',
    'LICENSE'
)
foreach ($name in $requiredAssets) {
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedArtifactRoot $name) -PathType Leaf)) {
        throw "Required direct release asset is missing: $name"
    }
}
$unexpectedFiles = @(Get-ChildItem -LiteralPath $resolvedArtifactRoot -File | Where-Object {
    $_.Name -notin @($requiredAssets + 'SHA256SUMS.txt')
})
if ($unexpectedFiles.Count -gt 0) {
    throw "Direct release asset directory contains unexpected files: $($unexpectedFiles.Name -join ', ')"
}
foreach ($pattern in @('*.sig', 'latest.json', '*.msi')) {
    if (Get-ChildItem -LiteralPath $resolvedArtifactRoot -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue) {
        throw "Direct-only release contains updater or MSI artifact: $pattern"
    }
}

$signature = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($signature.Status -ne 'NotSigned') {
    throw "Direct-only installer must be clearly unsigned; Authenticode status is $($signature.Status)."
}

$sbomPath = Join-Path $resolvedArtifactRoot 'pulsaria-release.spdx.json'
$sbom = Get-Content -LiteralPath $sbomPath -Raw | ConvertFrom-Json
if ([string]$sbom.spdxVersion -ne 'SPDX-2.3') { throw 'Direct release SBOM is not SPDX-2.3 JSON.' }
$tauri = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
if ([string]$sbom.name -ne "pulsaria-release-$ReleaseVersion" -or [string]$tauri.version -ne $ReleaseVersion) {
    throw 'Release version does not match the Tauri build and aggregate SBOM.'
}

$checksumPath = Join-Path $resolvedArtifactRoot 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { throw 'Direct release SHA256SUMS.txt is missing.' }
$entries = @{}
foreach ($line in Get-Content -LiteralPath $checksumPath) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+?)\s*$') { throw "Invalid SHA256SUMS.txt entry: $line" }
    $name = $Matches[2].Trim()
    if ($entries.ContainsKey($name)) { throw "Duplicate checksum entry: $name" }
    $entries[$name] = $Matches[1].ToUpperInvariant()
}
if ($entries.Count -ne $requiredAssets.Count) { throw 'Checksum manifest must cover exactly the four direct release assets.' }
foreach ($name in $requiredAssets) {
    $path = Join-Path $resolvedArtifactRoot $name
    if (-not $entries.ContainsKey($name)) { throw "Checksum manifest is missing $name" }
    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($entries[$name] -ne $actual) { throw "Checksum mismatch for $name" }
}

[ordered]@{
    status = 'PASS'
    version = $ReleaseVersion
    installer = @{ name = $installerName; bytes = (Get-Item -LiteralPath $installerPath).Length; sha256 = $entries[$installerName]; authenticode = [string]$signature.Status }
    sbom = @{ name = 'pulsaria-release.spdx.json'; bytes = (Get-Item -LiteralPath $sbomPath).Length }
    checksumEntries = $entries.Count
    updaterArtifacts = 'absent by direct-download design'
} | ConvertTo-Json -Depth 4
Write-Host 'PULSARIA DIRECT RELEASE ARTIFACT GATE: PASS'
