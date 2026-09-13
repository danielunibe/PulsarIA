[CmdletBinding()]
param(
    [string]$ArtifactRoot,
    [switch]$RequireAuthenticode
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
    $ArtifactRoot = Join-Path ((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path) 'target-tauri/release/bundle'
}
$resolvedArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath $resolvedArtifactRoot -PathType Container)) {
    throw "Release artifact directory not found: $resolvedArtifactRoot"
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeManifestGate = Join-Path $projectRoot 'scripts/verify-runtime-manifest.ps1'
if (-not (Test-Path -LiteralPath $runtimeManifestGate -PathType Leaf)) {
    throw "Runtime resource verifier not found: $runtimeManifestGate"
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeManifestGate
if ($LASTEXITCODE -ne 0) {
    throw 'Release artifact verification is blocked because the bundled runtime resource contract is not PASS'
}

function Get-Sha256Hex {
    param([string]$Path)
    $getFileHash = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($null -ne $getFileHash) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToUpperInvariant()
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Get-RequiredArtifact {
    param(
        [string]$Directory,
        [string]$Filter,
        [string]$Label
    )
    $candidate = Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $candidate) { throw "$Label artifact not found under $Directory" }
    return $candidate
}

$nsis = Get-RequiredArtifact (Join-Path $resolvedArtifactRoot 'nsis') '*_x64-setup.exe' 'NSIS'
$msi = Get-RequiredArtifact (Join-Path $resolvedArtifactRoot 'msi') '*_x64*.msi' 'MSI'
$latest = Get-ChildItem -LiteralPath $resolvedArtifactRoot -Filter 'latest.json' -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if ($null -eq $latest) { throw 'latest.json was not generated.' }

$signatures = @(Get-ChildItem -LiteralPath $resolvedArtifactRoot -Filter '*.sig' -File -Recurse -ErrorAction SilentlyContinue)
if ($signatures.Count -eq 0) { throw 'No updater signature (*.sig) artifacts were generated.' }
if ($signatures | Where-Object { $_.Length -eq 0 }) { throw 'An updater signature file is empty.' }

try {
    $manifest = Get-Content -LiteralPath $latest.FullName -Raw | ConvertFrom-Json
} catch {
    throw "latest.json is not valid JSON: $($_.Exception.Message)"
}
if ([string]::IsNullOrWhiteSpace([string]$manifest.version)) {
    throw 'latest.json does not contain a version.'
}
$platforms = @($manifest.platforms.PSObject.Properties)
if ($platforms.Count -eq 0) { throw 'latest.json does not contain any updater platform.' }
foreach ($platform in $platforms) {
    $entry = $platform.Value
    if ([string]::IsNullOrWhiteSpace([string]$entry.url) -or [string]::IsNullOrWhiteSpace([string]$entry.signature)) {
        throw "Updater platform $($platform.Name) is missing url or signature."
    }
    $uri = [Uri]$entry.url
    if ($uri.Scheme -ne 'https') { throw "Updater platform $($platform.Name) does not use HTTPS." }
}

$authenticode = [ordered]@{}
foreach ($artifact in @($nsis, $msi)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    $authenticode[$artifact.Name] = [string]$signature.Status
    if ($RequireAuthenticode -and $signature.Status -ne 'Valid') {
        throw "Authenticode verification failed for $($artifact.Name): $($signature.Status)"
    }
}

$workspaceRoot = $projectRoot
$textExtensions = @('.env', '.json', '.js', '.mjs', '.md', '.ps1', '.rs', '.toml', '.ts', '.tsx', '.txt', '.yml', '.yaml')
$scanRoots = @(
    (Join-Path $workspaceRoot '.github'),
    (Join-Path $workspaceRoot 'docs'),
    (Join-Path $workspaceRoot 'scripts'),
    (Join-Path $workspaceRoot 'src-tauri/src'),
    (Join-Path $workspaceRoot 'src-tauri/capabilities'),
    (Join-Path $workspaceRoot 'package.json'),
    (Join-Path $workspaceRoot 'package-lock.json'),
    (Join-Path $workspaceRoot 'src-tauri/tauri.conf.json')
)
$scanFiles = foreach ($scanRoot in $scanRoots) {
    if (Test-Path -LiteralPath $scanRoot -PathType Leaf) {
        Get-Item -LiteralPath $scanRoot
    } elseif (Test-Path -LiteralPath $scanRoot -PathType Container) {
        Get-ChildItem -LiteralPath $scanRoot -File -Recurse -ErrorAction SilentlyContinue
    }
}
foreach ($scanFile in $scanFiles) {
    if ($textExtensions -contains $scanFile.Extension.ToLowerInvariant() -and
        (Select-String -LiteralPath $scanFile.FullName -Pattern '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' -Quiet -ErrorAction SilentlyContinue)) {
        throw 'A private key block was found in the release workspace.'
    }
}

[ordered]@{
    status = 'PASS'
    nsis = @{ path = $nsis.FullName; sha256 = Get-Sha256Hex $nsis.FullName; bytes = $nsis.Length }
    msi = @{ path = $msi.FullName; sha256 = Get-Sha256Hex $msi.FullName; bytes = $msi.Length }
    latestJson = @{ path = $latest.FullName; version = [string]$manifest.version }
    signatureCount = $signatures.Count
    authenticode = $authenticode
} | ConvertTo-Json -Depth 6

Write-Host 'PULSARIA RELEASE ARTIFACT GATE: PASS'
