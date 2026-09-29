$ErrorActionPreference = 'Stop'
$verifier = (Resolve-Path (Join-Path $PSScriptRoot '../verify-direct-release-artifacts.ps1')).Path
$root = Join-Path $env:TEMP "pulsaria-artifact-unit-$([guid]::NewGuid().ToString('N'))"
$source = Join-Path $root 'source'
$assets = Join-Path $root 'assets'
$version = '0.1.0-beta.3'
$commit = 'a' * 40
$runId = '12345'
# Unit fixture only: native signatures, installation and runtime are not tested.
function Get-AuthenticodeSignature { param([string]$LiteralPath) return @{ Status = 'NotSigned' } }
function Verify-Fixture {
    param([string]$ExpectedSource = $commit, [string]$ExpectedRun = $runId)
    & $verifier -ArtifactRoot $assets -ReleaseVersion $version -ExpectedCommit $ExpectedSource -ExpectedRunId $ExpectedRun -AssetsOnly -ProjectRoot $source | Out-Null
}
function Assert-Rejected {
    param([scriptblock]$Action, [string]$Label)
    $rejected = $false
    try { & $Action } catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture should be rejected: $Label" }
    Write-Host "PASS rejection: $Label"
}
try {
    New-Item -ItemType Directory -Path $assets, (Join-Path $source 'legal'), (Join-Path $source 'src-tauri') -Force | Out-Null
    '{"version":"0.1.0-beta.3"}' | Set-Content (Join-Path $source 'src-tauri/tauri.conf.json')
    foreach ($name in @("Pulsaria_${version}_x64-setup.exe", 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'third-party-ffmpeg-source.txt')) { "Unit fixture $name" | Set-Content (Join-Path $assets $name) }
    foreach ($name in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) { Copy-Item (Join-Path $assets $name) (Join-Path $source $name) }
    $materialHash = (Get-FileHash (Join-Path $assets 'third-party-ffmpeg-source.txt')).Hash
    @{ schema_version = 1; review_status = 'reviewed'; files = @(@{ name = 'third-party-ffmpeg-source.txt'; sha256 = $materialHash }) } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $source 'legal/third-party-materials.json')
    @{ spdxVersion = 'SPDX-2.3'; name = "pulsaria-release-$version" } | ConvertTo-Json | Set-Content (Join-Path $assets 'pulsaria-release.spdx.json')
    $records = @(Get-ChildItem $assets -File | ForEach-Object { @{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash $_.FullName).Hash } })
    @{ schema_version = 1; tag = "v$version"; version = $version; source_commit = $commit; workflow_run_id = $runId; automated_installed_smoke = 'PASS'; assets = $records } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $assets 'release-provenance.json')
    @(Get-ChildItem $assets -File | ForEach-Object { "$((Get-FileHash $_.FullName).Hash)  $($_.Name)" }) | Set-Content (Join-Path $assets 'SHA256SUMS.txt')
    Verify-Fixture
    Write-Host 'PASS unit fixture: reviewed payload with additional source asset'
    Assert-Rejected { Verify-Fixture -ExpectedSource ('b' * 40) } 'different source commit'
    Assert-Rejected { Verify-Fixture -ExpectedRun '99999' } 'different Actions run'
    'Unexpected' | Set-Content (Join-Path $assets 'unexpected.txt')
    Assert-Rejected { Verify-Fixture } 'unlisted asset'
    Remove-Item -LiteralPath (Join-Path $assets 'unexpected.txt')
    $checksumText = Get-Content (Join-Path $assets 'SHA256SUMS.txt') -Raw
    $checksumText + "`n$('0' * 64)  ../escape.txt" | Set-Content (Join-Path $assets 'SHA256SUMS.txt')
    Assert-Rejected { Verify-Fixture } 'path traversal in checksums'
    $checksumText | Set-Content (Join-Path $assets 'SHA256SUMS.txt') -NoNewline
    'Tampered installer' | Set-Content (Join-Path $assets "Pulsaria_${version}_x64-setup.exe")
    Assert-Rejected { Verify-Fixture } 'tampered installer'
    Write-Host 'PULSARIA RELEASE ARTIFACT UNIT TESTS: PASS (6 cases; no native acceptance claim)'
} finally {
    $resolved = [System.IO.Path]::GetFullPath($root)
    $prefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\pulsaria-artifact-unit-'
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe unit fixture cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
