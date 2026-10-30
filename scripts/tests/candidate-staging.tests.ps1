$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../file-integrity.ps1')
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$fixtureRoot = Join-Path $env:TEMP "pulsaria-candidate-staging-$([guid]::NewGuid().ToString('N'))"
$sourceRoot = Join-Path $fixtureRoot 'source'
$fixtureScripts = Join-Path $sourceRoot 'scripts'
$materialsRoot = Join-Path $fixtureRoot 'materials'
$artifactRoot = Join-Path $fixtureRoot 'candidate'
$version = '0.1.0-beta.4'
$commit = 'a' * 40
$runId = '12345'

# Only the gate invocation is isolated here. The real artifact verifier checks
# the staged bytes; these fixtures do not certify installation or legal review.
function Get-AuthenticodeSignature { param([string]$LiteralPath) return @{ Status = 'NotSigned' } }

try {
    New-Item -ItemType Directory -Path $fixtureScripts, $materialsRoot, (Join-Path $sourceRoot 'legal'), (Join-Path $sourceRoot 'src-tauri') -Force | Out-Null
    foreach ($name in @('stage-direct-release.ps1', 'verify-direct-release-artifacts.ps1', 'verify-release-contact.mjs', 'file-integrity.ps1')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "scripts/$name") -Destination (Join-Path $fixtureScripts $name)
    }
    @'
[CmdletBinding()]
param([switch]$RequireSbom, [switch]$CandidateOnly, [string]$SbomPath, [string]$MaterialsRoot)
if (-not $RequireSbom -or -not (Test-Path -LiteralPath $SbomPath) -or -not (Test-Path -LiteralPath $MaterialsRoot)) {
    throw 'Staging must retain the SBOM and third-party materials gate.'
}
$contactArgs = @('--manifest', (Join-Path $PSScriptRoot '../legal/release-manifest.json'))
if ($CandidateOnly) { $contactArgs += '--candidate-only' }
& node (Join-Path $PSScriptRoot 'verify-release-contact.mjs') @contactArgs
if ($LASTEXITCODE -ne 0) { throw 'Contact gate rejected staging.' }
if (-not $CandidateOnly) { throw 'Staging must request a candidate check.' }
'candidate-only' | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../candidate-gate-mode.txt')
'@ | Set-Content -LiteralPath (Join-Path $fixtureScripts 'verify-legal-release.ps1') -Encoding utf8
    '[CmdletBinding()] param([string]$ProjectRoot) exit 0' | Set-Content -LiteralPath (Join-Path $fixtureScripts 'verify-runtime-manifest.ps1') -Encoding utf8

    $manifestPath = Join-Path $sourceRoot 'legal/release-manifest.json'
    @{
        public_owner = 'Fixture owner'; legal_contact_email = 'fixture@example.test'; notice_city = 'Fixture city'
        release_version = $version; public_contact_review_version = $version; public_contact_review_status = 'pending'
    } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
    @{ version = $version } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sourceRoot 'src-tauri/tauri.conf.json') -Encoding utf8
    foreach ($name in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) { "Fixture $name" | Set-Content -LiteralPath (Join-Path $sourceRoot $name) }
    $materialPath = Join-Path $materialsRoot 'third-party-ffmpeg-source.txt'
    'Fixture source material' | Set-Content -LiteralPath $materialPath
    @{ schema_version = 1; review_status = 'reviewed'; files = @(@{ name = 'third-party-ffmpeg-source.txt'; sha256 = Get-PulsariaSha256 -Path $materialPath }) } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $sourceRoot 'legal/third-party-materials.json')
    $installerPath = Join-Path $fixtureRoot "Pulsaria_${version}_x64-setup.exe"
    'Fixture installer' | Set-Content -LiteralPath $installerPath
    $sbomPath = Join-Path $fixtureRoot 'sbom.json'
    @{ spdxVersion = 'SPDX-2.3'; name = "pulsaria-release-$version" } | ConvertTo-Json | Set-Content -LiteralPath $sbomPath

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & node (Join-Path $fixtureScripts 'verify-release-contact.mjs') --manifest $manifestPath 2>&1 | Out-Null }
    finally { $ErrorActionPreference = $previousErrorActionPreference }
    if ($LASTEXITCODE -eq 0) { throw 'Pending review must still block publication.' }
    Write-Host 'PASS: publication rejects pending contact review'

    $stageArguments = @{
        ArtifactRoot = $artifactRoot; InstallerPath = $installerPath; SbomPath = $sbomPath
        MaterialsRoot = $materialsRoot; ReleaseTag = "v$version"; SourceCommit = $commit; RunId = $runId
    }
    & (Join-Path $fixtureScripts 'stage-direct-release.ps1') @stageArguments | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $artifactRoot 'release-provenance.json'))) { throw 'Candidate artifact was not preserved.' }
    if ((Get-Content -LiteralPath (Join-Path $sourceRoot 'candidate-gate-mode.txt') -Raw).Trim() -ne 'candidate-only') { throw 'Wrong staging gate mode.' }
    Write-Host 'PASS: candidate staging preserves verified assets while contact review is pending'

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.public_contact_review_status -ne 'pending') { throw 'Staging changed the public approval.' }
    if ((Get-PulsariaSha256 -Path $installerPath) -ne (Get-PulsariaSha256 -Path (Join-Path $artifactRoot ([IO.Path]::GetFileName($installerPath))))) { throw 'Staged installer changed.' }
    Write-Host 'PASS: staging preserves the installer bytes and pending approval'

    $rejected = $false
    try { & (Join-Path $fixtureScripts 'stage-direct-release.ps1') @stageArguments | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'An existing immutable candidate must not be overwritten.' }
    Write-Host 'PULSARIA CANDIDATE STAGING TESTS: PASS (4 cases; gate fixtures only)'
} finally {
    $resolved = [System.IO.Path]::GetFullPath($fixtureRoot)
    $prefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\pulsaria-candidate-staging-'
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe candidate fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
