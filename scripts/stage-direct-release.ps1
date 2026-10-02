[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ArtifactRoot,
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [Parameter(Mandatory = $true)][string]$SbomPath,
    [Parameter(Mandatory = $true)][string]$MaterialsRoot,
    [Parameter(Mandatory = $true)][string]$ReleaseTag,
    [Parameter(Mandatory = $true)][string]$SourceCommit,
    [Parameter(Mandatory = $true)][string]$RunId
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($ReleaseTag -notmatch '^v\d+\.\d+\.\d+-(beta|rc)\.\d+$' -or $SourceCommit -notmatch '^[a-f0-9]{40}$' -or $RunId -notmatch '^\d+$') {
    throw 'A versioned prerelease tag, full source commit, and Actions run ID are required.'
}
if (Test-Path -LiteralPath $ArtifactRoot) { throw 'Use a fresh staging directory; stale release files are not accepted.' }
& (Join-Path $PSScriptRoot 'verify-legal-release.ps1') -RequireSbom -SbomPath $SbomPath -MaterialsRoot $MaterialsRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot stage release assets with an unresolved legal gate.' }
New-Item -ItemType Directory -Path $ArtifactRoot | Out-Null
$version = $ReleaseTag.Substring(1)
$inputs = @(
    @{ Path = $InstallerPath; Name = "Pulsaria_${version}_x64-setup.exe" },
    @{ Path = $SbomPath; Name = 'pulsaria-release.spdx.json' },
    @{ Path = (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md'); Name = 'THIRD_PARTY_NOTICES.md' },
    @{ Path = (Join-Path $projectRoot 'LICENSE'); Name = 'LICENSE' }
)
$materials = Get-Content -LiteralPath (Join-Path $projectRoot 'legal/third-party-materials.json') -Raw | ConvertFrom-Json
foreach ($file in $materials.files) { $inputs += @{ Path = (Join-Path $MaterialsRoot $file.name); Name = $file.name } }
foreach ($source in $inputs) {
    Copy-Item -LiteralPath $source.Path -Destination (Join-Path $ArtifactRoot $source.Name) -ErrorAction Stop
}
$assetRecords = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Sort-Object Name | ForEach-Object {
    [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
[ordered]@{
    schema_version = 1
    tag = $ReleaseTag
    version = $version
    source_commit = $SourceCommit
    workflow_run_id = $RunId
    workflow_url = "https://github.com/danielunibe/PulsarIA/actions/runs/$RunId"
    automated_installed_smoke = 'PASS'
    assets = $assetRecords
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $ArtifactRoot 'release-provenance.json') -Encoding utf8
$checksums = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Sort-Object Name | ForEach-Object {
    "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash )  $($_.Name)"
})
$checksums | Set-Content -LiteralPath (Join-Path $ArtifactRoot 'SHA256SUMS.txt') -Encoding utf8
& (Join-Path $PSScriptRoot 'verify-direct-release-artifacts.ps1') -ArtifactRoot $ArtifactRoot -ReleaseVersion $version -ExpectedCommit $SourceCommit -ExpectedRunId $RunId
if ($LASTEXITCODE -ne 0) { throw 'Staged release artifact validation failed.' }
