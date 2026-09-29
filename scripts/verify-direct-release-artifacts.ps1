[CmdletBinding()]
param(
    [string]$ArtifactRoot,
    [Parameter(Mandatory = $true)][string]$ReleaseVersion,
    [string]$ExpectedCommit,
    [string]$ExpectedRunId,
    [switch]$AssetsOnly,
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) { $ArtifactRoot = Join-Path $ProjectRoot 'target-tauri/release/direct-assets' }
if ($ReleaseVersion -notmatch '^\d+\.\d+\.\d+-(beta|rc)\.\d+$') { throw 'A beta/rc release version is required.' }
if ($ExpectedCommit -notmatch '^[a-f0-9]{40}$' -or $ExpectedRunId -notmatch '^\d+$') { throw 'Trusted source commit and Actions run ID are required.' }
$resolvedRoot = (Resolve-Path -LiteralPath $ArtifactRoot).Path
if (-not $AssetsOnly) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot 'scripts/verify-runtime-manifest.ps1') -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw 'Direct release runtime manifest is not PASS.' }
}

$materials = Get-Content -LiteralPath (Join-Path $ProjectRoot 'legal/third-party-materials.json') -Raw | ConvertFrom-Json
if ($materials.schema_version -ne 1 -or $materials.review_status -ne 'reviewed' -or @($materials.files).Count -eq 0) { throw 'Third-party source/build materials are not reviewed.' }
$installerName = "Pulsaria_${ReleaseVersion}_x64-setup.exe"
$payloadNames = @($installerName, 'pulsaria-release.spdx.json', 'THIRD_PARTY_NOTICES.md', 'LICENSE')
foreach ($file in $materials.files) {
    $name = [string]$file.name
    if ($name -notmatch '^third-party-[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|tar\.gz|txt|md)$' -or $payloadNames -contains $name -or [string]$file.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid or duplicate third-party material: $name" }
    $payloadNames += $name
}
$requiredNames = @($payloadNames + 'release-provenance.json')
$entries = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $resolvedRoot 'SHA256SUMS.txt')) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}([A-Za-z0-9][A-Za-z0-9._-]*)$') { throw "Invalid checksum entry: $line" }
    $name = $Matches[2]
    if ($entries.ContainsKey($name) -or $requiredNames -notcontains $name) { throw "Unexpected or duplicate checksum entry: $name" }
    $entries[$name] = $Matches[1].ToUpperInvariant()
}
if ($entries.Count -ne $requiredNames.Count) { throw 'Checksums must cover every staged public asset exactly once.' }
$files = @(Get-ChildItem -LiteralPath $resolvedRoot -Force)
if (@($files | Where-Object { $_.PSIsContainer -or ($requiredNames + 'SHA256SUMS.txt') -notcontains $_.Name -or $_.LinkType }).Count -gt 0) {
    throw 'Unexpected directory, link, or file in direct release assets.'
}
foreach ($name in $requiredNames) {
    $filePath = Join-Path $resolvedRoot $name
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf) -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -ne $entries[$name]) { throw "Checksum mismatch or missing asset: $name" }
}
foreach ($file in $materials.files) {
    if ($entries[[string]$file.name] -ne [string]$file.sha256) { throw "Third-party material differs from reviewed source: $($file.name)" }
}
foreach ($name in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    if ((Get-FileHash -LiteralPath (Join-Path $ProjectRoot $name) -Algorithm SHA256).Hash -ne $entries[$name]) { throw "Legal asset differs from approved tagged source: $name" }
}
$provenance = Get-Content -LiteralPath (Join-Path $resolvedRoot 'release-provenance.json') -Raw | ConvertFrom-Json
if ($provenance.schema_version -ne 1 -or $provenance.tag -ne "v$ReleaseVersion" -or $provenance.version -ne $ReleaseVersion -or $provenance.source_commit -ne $ExpectedCommit -or [string]$provenance.workflow_run_id -ne $ExpectedRunId -or $provenance.automated_installed_smoke -ne 'PASS') {
    throw 'Release provenance does not match the approved source, run, version, or installed smoke.'
}
$provenanceNames = @{}
foreach ($asset in $provenance.assets) {
    $name = [string]$asset.name
    if ($payloadNames -notcontains $name -or $provenanceNames.ContainsKey($name) -or $entries[$name] -ne [string]$asset.sha256 -or (Get-Item -LiteralPath (Join-Path $resolvedRoot $name)).Length -ne [long]$asset.bytes) { throw "Incorrect provenance asset: $name" }
    $provenanceNames[$name] = $true
}
if ($provenanceNames.Count -ne $payloadNames.Count) { throw 'Release provenance does not cover all payload assets.' }
$sbom = Get-Content -LiteralPath (Join-Path $resolvedRoot 'pulsaria-release.spdx.json') -Raw | ConvertFrom-Json
$tauri = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
if ($sbom.spdxVersion -ne 'SPDX-2.3' -or $sbom.name -ne "pulsaria-release-$ReleaseVersion" -or $tauri.version -ne $ReleaseVersion) { throw 'SPDX, Tauri and release versions must agree.' }
$installerPath = Join-Path $resolvedRoot $installerName
$signature = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($signature.Status -ne 'NotSigned') { throw "Direct installer must be explicitly unsigned: $($signature.Status)" }
[ordered]@{
    status = 'PASS'; version = $ReleaseVersion; sourceCommit = $ExpectedCommit; runId = $ExpectedRunId
    installer = @{ name = $installerName; bytes = (Get-Item -LiteralPath $installerPath).Length; sha256 = $entries[$installerName]; authenticode = [string]$signature.Status }
    checksumEntries = $entries.Count; runtimeVerified = (-not $AssetsOnly)
    updaterArtifacts = 'absent by direct-download design'
} | ConvertTo-Json -Depth 4
Write-Host 'PULSARIA DIRECT RELEASE ARTIFACT GATE: PASS'
