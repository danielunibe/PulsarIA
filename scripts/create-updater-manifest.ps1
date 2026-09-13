[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactRoot,
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [Parameter(Mandatory = $true)]
    [string]$ReleaseTag,
    [string]$Repository = 'danielunibe/PulsarIA',
    [string]$Notes = 'Mejoras de estabilidad, privacidad y seguridad.'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($ArtifactRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
    throw "Release artifact directory not found: $resolvedRoot"
}

$updaterPackage = Get-ChildItem -LiteralPath $resolvedRoot -Filter '*.nsis.zip' -File -Recurse |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if ($null -eq $updaterPackage) { throw 'The NSIS updater package (*.nsis.zip) was not generated.' }

$signaturePath = "$($updaterPackage.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
    throw "Updater signature not found next to $($updaterPackage.Name)"
}
$signature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($signature)) { throw 'The updater signature is empty.' }

$safeTag = [Uri]::EscapeDataString($ReleaseTag)
$safeFileName = [Uri]::EscapeDataString($updaterPackage.Name)
$manifest = [ordered]@{
    version = $Version
    notes = $Notes
    pub_date = [DateTime]::UtcNow.ToString('o')
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            signature = $signature
            url = "https://github.com/$Repository/releases/download/$safeTag/$safeFileName"
        }
    }
}

$outputPath = Join-Path $resolvedRoot 'latest.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Host "Updater manifest created: $outputPath"
