[CmdletBinding()]
param([string]$SourceRoot)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }
$manifestPath = Join-Path $SourceRoot 'src-tauri/resources/local-llm-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]$manifest.download_url -notmatch '^https://') { throw 'Local model URL must use HTTPS.' }
if ([string]$manifest.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Local model SHA-256 is invalid.' }
if ([int64]$manifest.expected_size -le 0) { throw 'Local model expected size is invalid.' }
if ([string]$manifest.license_spdx -eq 'UNKNOWN') { throw 'Local model license is unknown.' }
$sidecar = Join-Path $SourceRoot ('src-tauri/resources/bin/' + [string]$manifest.sidecar_executable)
if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw "Sidecar missing: $sidecar" }
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $hash = ([BitConverter]::ToString($sha256.ComputeHash([IO.File]::ReadAllBytes($sidecar)))).Replace('-', '')
} finally {
    $sha256.Dispose()
}
Write-Host "Sidecar: $($manifest.sidecar_version) / $hash"
if ([string]$manifest.download_url -match 'generativelanguage|googleapis') { throw 'Disallowed cloud LLM endpoint in local model manifest.' }
Write-Host 'PULSARIA LOCAL LLM CONTRACT: PASS (pinned manifest, sidecar present, no model bundled)'
