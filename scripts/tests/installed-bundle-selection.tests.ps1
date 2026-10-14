$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../resolve-installed-bundle.ps1')
$fixtureRoot = Join-Path $env:TEMP "pulsaria-bundle-selection-$([guid]::NewGuid().ToString('N'))"
$version = '0.1.0-beta.4'

function Assert-Rejected {
    param([scriptblock]$Action, [string]$Label)
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Bundle selection should reject: $Label" }
    Write-Host "PASS rejection: $Label"
}

try {
    $nsisRoot = Join-Path $fixtureRoot 'nsis'
    $msiRoot = Join-Path $fixtureRoot 'msi'
    New-Item -ItemType Directory -Path $nsisRoot, $msiRoot | Out-Null
    $current = Join-Path $nsisRoot "Pulsaria_${version}_x64-setup.exe"
    $stale = Join-Path $nsisRoot 'Pulsaria_0.1.0-beta.3_x64-setup.exe'
    'Current fixture' | Set-Content -LiteralPath $current
    'Stale fixture' | Set-Content -LiteralPath $stale
    (Get-Item -LiteralPath $stale).LastWriteTimeUtc = [DateTime]::UtcNow.AddDays(1)
    $selected = Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version
    if ($selected -ne $current) { throw 'A newer timestamp selected the wrong release.' }
    Write-Host 'PASS: the release version wins over a newer stale installer'

    $hash = Get-PulsariaSha256 -Path $current
    $selected = Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version -InstallerPath $current -ExpectedSha256 $hash
    if ($selected -ne $current) { throw 'Explicit artifact selection failed.' }
    Write-Host 'PASS: an explicit candidate is verified by SHA-256'
    Assert-Rejected { Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version -InstallerPath $stale } 'a different version'
    Assert-Rejected { Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version -ExpectedSha256 ('0' * 64) } 'a different SHA-256'
    Remove-Item -LiteralPath $current
    Assert-Rejected { Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version } 'missing current release despite an old installer'

    $msi = Join-Path $msiRoot "Pulsaria_${version}_x64_en-US.msi"
    'MSI fixture' | Set-Content -LiteralPath $msi
    if ((Resolve-InstalledBundlePath -BundleRoot $fixtureRoot -ReleaseVersion $version -Bundle msi) -ne $msi) { throw 'MSI version selection failed.' }
    Write-Host 'PASS: MSI selection also requires the current release'

    # Stub registry reads only; no installed application or registry is changed.
    $script:fixtureDisplayName = 'Another product'
    function Get-ItemProperty { param([string]$Path, [object]$ErrorAction) @{ DisplayName = $script:fixtureDisplayName } }
    Assert-InstallerHostIsIsolated -ProductName 'Pulsaria'
    Write-Host 'PASS: unrelated products do not block the installation smoke'
    $script:fixtureDisplayName = 'Pulsaria'
    Assert-Rejected { Assert-InstallerHostIsIsolated -ProductName 'Pulsaria' } 'an existing Pulsaria registration'
    $hashFixture = Join-Path $fixtureRoot 'hash.txt'
    [IO.File]::WriteAllText($hashFixture, 'abc', [Text.Encoding]::ASCII)
    if ((Get-PulsariaSha256 -Path $hashFixture) -ne 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD') { throw 'SHA-256 differs from the known abc test vector.' }
    Write-Host 'PULSARIA INSTALLED BUNDLE SELECTION TESTS: PASS (9 cases; no installer execution)'
} finally {
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    $prefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\pulsaria-bundle-selection-'
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe bundle fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
