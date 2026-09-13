[CmdletBinding()]
param(
    [string]$SourceRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}
$gatewayPath = Join-Path $SourceRoot 'src-tauri/src/api/gateway.rs'
if (-not (Test-Path -LiteralPath $gatewayPath -PathType Leaf)) {
    throw "Gateway source not found: $gatewayPath"
}

$gateway = Get-Content -LiteralPath $gatewayPath -Raw
if ($gateway -notmatch 'pub const API_BIND_HOST:\s*&str\s*=\s*"127\.0\.0\.1"') {
    throw 'The API loopback bind contract is missing or changed.'
}
if ($gateway -notmatch 'validate_api_bind_host\(\&configured_host\)') {
    throw 'The configured API host is not validated before binding.'
}
if ($gateway -match 'TcpListener::bind\([^)]*(?:0\.0\.0\.0|\[::\])') {
    throw 'An external IPv4/IPv6 bind was found in the API gateway.'
}

Write-Host 'PULSARIA API LOOPBACK GATE: PASS (127.0.0.1 only)'
