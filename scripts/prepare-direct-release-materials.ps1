[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$DestinationRoot)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'legal/third-party-materials.json') -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 1 -or $manifest.review_status -ne 'reviewed' -or @($manifest.files).Count -eq 0) {
    throw 'Third-party source/build materials must be identified and reviewed before building a public release.'
}
New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
$names = @{}
foreach ($file in $manifest.files) {
    $name = [string]$file.name
    if ($name -notmatch '^third-party-[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|tar\.gz|txt|md)$' -or $names.ContainsKey($name)) {
        throw "Invalid or duplicate third-party asset name: $name"
    }
    $names[$name] = $true
    $uri = [uri]$file.url
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or [string]$file.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw "Third-party material must have an HTTPS URL and pinned SHA-256: $name"
    }
    $destination = Join-Path $DestinationRoot $name
    Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile $destination
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne [string]$file.sha256) {
        throw "Third-party material checksum mismatch: $name"
    }
}
Write-Host 'PULSARIA THIRD-PARTY MATERIALS: PASS'
