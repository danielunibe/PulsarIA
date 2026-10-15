$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../file-integrity.ps1')
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$fixtureRoot = Join-Path $env:TEMP "pulsaria-bootstrap-unit-$([guid]::NewGuid().ToString('N'))"
$sourceRoot = Join-Path $fixtureRoot 'source'
$runnerRoot = Join-Path $fixtureRoot 'runner'
$previousRunnerTemp = $env:RUNNER_TEMP
$global:bootstrapFixture = @{ registered = $false; downloads = 0; installs = 0; uninstalls = 0; uninstallExit = 0 }

# Network, registry and native installers are fixtures. The actual bootstrap
# script still prepares, verifies and cleans its owned directory in sequence.
function global:Get-ItemProperty {
    param([string]$Path, [object]$ErrorAction)
    if ($global:bootstrapFixture.registered) { @{ DisplayName = 'Pulsaria' } }
}
function global:Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile)
    $global:bootstrapFixture.downloads++
    'Fixture installer' | Set-Content -LiteralPath $OutFile
}
function global:Start-Process {
    param([string]$FilePath, [object[]]$ArgumentList, [string]$WindowStyle, [switch]$Wait, [switch]$PassThru)
    if ($WindowStyle -ne 'Hidden' -or -not $Wait -or -not $PassThru) { throw 'Bootstrap processes must run hidden and be awaited.' }
    if ([IO.Path]::GetFileName($FilePath) -eq 'uninstall.exe') {
        $expectedInstallRoot = Split-Path -Parent $FilePath
        $actualInstallArgument = if ($ArgumentList.Count -gt 1) { [string]$ArgumentList[1] } else { '' }
        $actualInstallRoot = if ($actualInstallArgument.StartsWith('_?=')) { $actualInstallArgument.Substring(3) } else { '' }
        $expectedResolved = (Resolve-Path -LiteralPath $expectedInstallRoot).Path.TrimEnd([char[]]@('\', '/'))
        $actualResolved = if (Test-Path -LiteralPath $actualInstallRoot -PathType Container) {
            (Resolve-Path -LiteralPath $actualInstallRoot).Path.TrimEnd([char[]]@('\', '/'))
        } else { '' }
        $sameInstallRoot = [System.StringComparer]::OrdinalIgnoreCase.Equals($actualResolved, $expectedResolved)
        if ($ArgumentList.Count -ne 2 -or $ArgumentList[0] -ne '/S' -or -not $sameInstallRoot) {
            throw "NSIS must be awaited with its exact owned install directory as the final _?= argument. Expected '$expectedResolved'; received '$actualInstallArgument'."
        }
        $global:bootstrapFixture.uninstalls++
        if ($global:bootstrapFixture.uninstallExit -eq 0) { $global:bootstrapFixture.registered = $false }
        return @{ ExitCode = $global:bootstrapFixture.uninstallExit }
    }
    $global:bootstrapFixture.installs++
    $installRoot = ([string]$ArgumentList[1]).Substring(3)
    foreach ($relative in @('resources/python', 'resources/assets/models', 'resources/bin')) {
        New-Item -ItemType Directory -Path (Join-Path $installRoot $relative) -Force | Out-Null
    }
    'Fixture uninstaller' | Set-Content -LiteralPath (Join-Path $installRoot 'uninstall.exe')
    $global:bootstrapFixture.registered = $true
    return @{ ExitCode = 0 }
}

try {
    $scriptsRoot = Join-Path $sourceRoot 'scripts'
    New-Item -ItemType Directory -Path $scriptsRoot, $runnerRoot, (Join-Path $sourceRoot 'src-tauri') -Force | Out-Null
    # Use the fixture installer's real hash in the copied test script. Production
    # keeps its pinned public hash, and the byte verification runs unmocked.
    $fixtureInstaller = Join-Path $fixtureRoot 'fixture-installer.exe'
    'Fixture installer' | Set-Content -LiteralPath $fixtureInstaller
    $fixtureHash = Get-PulsariaSha256 -Path $fixtureInstaller
    $bootstrapText = Get-Content -LiteralPath (Join-Path $projectRoot 'scripts/prepare-runtime-from-pinned-release.ps1') -Raw
    $bootstrapText.Replace('1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF', $fixtureHash) |
        Set-Content -LiteralPath (Join-Path $scriptsRoot 'prepare-runtime-from-pinned-release.ps1') -Encoding utf8
    Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts/resolve-installed-bundle.ps1') -Destination $scriptsRoot
    Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts/file-integrity.ps1') -Destination $scriptsRoot
    '{"productName":"Pulsaria"}' | Set-Content -LiteralPath (Join-Path $sourceRoot 'src-tauri/tauri.conf.json')
    '[CmdletBinding()] param([string]$RuntimeBundle, [string]$ProjectRoot) exit 0' | Set-Content -LiteralPath (Join-Path $scriptsRoot 'prepare-runtime.ps1')
    '[CmdletBinding()] param([string]$Mode, [string]$ProjectRoot) exit 0' | Set-Content -LiteralPath (Join-Path $scriptsRoot 'verify-runtime-manifest.ps1')
    $env:RUNNER_TEMP = $runnerRoot
    $bootstrap = Join-Path $scriptsRoot 'prepare-runtime-from-pinned-release.ps1'

    $global:bootstrapFixture.registered = $true
    $rejected = $false
    try { & $bootstrap -ProjectRoot $sourceRoot | Out-Null } catch { $rejected = $_.Exception.Message -match 'requires an isolated Windows' }
    if (-not $rejected -or $global:bootstrapFixture.downloads -ne 0 -or $global:bootstrapFixture.installs -ne 0) { throw 'An existing installation must be protected before download or installation.' }
    Write-Host 'PASS: an existing product is rejected before starting the bootstrap'

    $global:bootstrapFixture.registered = $false
    & $bootstrap -ProjectRoot $sourceRoot | Out-Null
    if ($global:bootstrapFixture.registered -or $global:bootstrapFixture.installs -ne 1 -or $global:bootstrapFixture.uninstalls -ne 1 -or @(Get-ChildItem -LiteralPath $runnerRoot).Count -ne 0) { throw 'Bootstrap must uninstall before deleting its directory.' }
    Write-Host 'PASS: the owned bootstrap is uninstalled and its directory removed'

    '[CmdletBinding()] param([string]$Mode, [string]$ProjectRoot) exit 1' | Set-Content -LiteralPath (Join-Path $scriptsRoot 'verify-runtime-manifest.ps1')
    $rejected = $false
    try { & $bootstrap -ProjectRoot $sourceRoot | Out-Null } catch { $rejected = $true }
    if (-not $rejected -or $global:bootstrapFixture.registered -or $global:bootstrapFixture.uninstalls -ne 2 -or @(Get-ChildItem -LiteralPath $runnerRoot).Count -ne 0) { throw 'A verification failure must still uninstall and clean the bootstrap.' }
    Write-Host 'PASS: verification failure still cleans the owned installation'

    '[CmdletBinding()] param([string]$Mode, [string]$ProjectRoot) exit 0' | Set-Content -LiteralPath (Join-Path $scriptsRoot 'verify-runtime-manifest.ps1')
    $global:bootstrapFixture.uninstallExit = 1
    $rejected = $false
    try { & $bootstrap -ProjectRoot $sourceRoot | Out-Null } catch { $rejected = $true }
    if (-not $rejected -or -not $global:bootstrapFixture.registered -or @(Get-ChildItem -LiteralPath $runnerRoot).Count -ne 1) { throw 'An uninstall failure must fail the gate and preserve its directory.' }
    Write-Host 'PULSARIA RUNTIME BOOTSTRAP TESTS: PASS (4 cases; native operations mocked)'
} finally {
    $env:RUNNER_TEMP = $previousRunnerTemp
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    $prefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\pulsaria-bootstrap-unit-'
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe bootstrap fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    Remove-Item Function:\Get-ItemProperty, Function:\Invoke-WebRequest, Function:\Start-Process -ErrorAction SilentlyContinue
    Remove-Variable bootstrapFixture -Scope Global -ErrorAction SilentlyContinue
}
