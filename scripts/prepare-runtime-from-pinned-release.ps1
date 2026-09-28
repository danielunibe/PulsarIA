[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
} else {
    $ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}

$runnerTempRaw = [Environment]::GetEnvironmentVariable('RUNNER_TEMP')
if ([string]::IsNullOrWhiteSpace($runnerTempRaw) -or -not (Test-Path -LiteralPath $runnerTempRaw -PathType Container)) {
    throw 'RUNNER_TEMP must identify an existing temporary directory.'
}
$runnerTemp = (Resolve-Path -LiteralPath $runnerTempRaw).Path
$runnerTempPrefix = $runnerTemp.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar

function Assert-OwnedRunnerTempPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($runnerTempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to use a path outside RUNNER_TEMP: $resolvedPath"
    }
}

$bootstrapRelease = 'v0.1.0-eval.3'
$bootstrapInstallerName = 'Pulsaria_0.1.0_x64-setup.exe'
$bootstrapSha256 = '1ABD7589C2E8943AEFC1AC8484B2133312D54C18F58BA306DC869031FB9551EF'
$bootstrapRoot = Join-Path $runnerTemp "pulsaria-runtime-bootstrap-$([guid]::NewGuid().ToString('N'))"
$bootstrapInstallerPath = Join-Path $bootstrapRoot $bootstrapInstallerName
$bootstrapInstallRoot = Join-Path $bootstrapRoot 'install'
Assert-OwnedRunnerTempPath $bootstrapRoot
Assert-OwnedRunnerTempPath $bootstrapInstallerPath
Assert-OwnedRunnerTempPath $bootstrapInstallRoot
if (Test-Path -LiteralPath $bootstrapRoot) {
    throw "Refusing to reuse an existing bootstrap temp directory: $bootstrapRoot"
}

$bootstrapRootCreated = $false
try {
    New-Item -ItemType Directory -Path $bootstrapRoot -ErrorAction Stop | Out-Null
    $bootstrapRootCreated = $true

    $bootstrapUrl = "https://github.com/danielunibe/PulsarIA/releases/download/$bootstrapRelease/$bootstrapInstallerName"
    Write-Host "Downloading pinned runtime bootstrap $bootstrapRelease/$bootstrapInstallerName"
    Invoke-WebRequest -Uri $bootstrapUrl -OutFile $bootstrapInstallerPath
    $actualHash = (Get-FileHash -LiteralPath $bootstrapInstallerPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actualHash -ne $bootstrapSha256) {
        throw "Pinned runtime bootstrap SHA-256 mismatch. Expected $bootstrapSha256; got $actualHash."
    }

    $install = Start-Process -FilePath $bootstrapInstallerPath -ArgumentList @('/S', "/D=$bootstrapInstallRoot") -WindowStyle Hidden -Wait -PassThru
    if ($install.ExitCode -notin @(0, 3010)) {
        throw "Runtime bootstrap installer failed with exit code $($install.ExitCode)."
    }

    $bootstrapResources = Join-Path $bootstrapInstallRoot 'resources'
    foreach ($relative in @('python', 'assets/models', 'bin')) {
        if (-not (Test-Path -LiteralPath (Join-Path $bootstrapResources $relative) -PathType Container)) {
            throw "Pinned runtime bootstrap is missing resources/$relative."
        }
    }

    $prepareRuntime = Join-Path $ProjectRoot 'scripts/prepare-runtime.ps1'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $prepareRuntime -RuntimeBundle $bootstrapResources -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        throw 'Runtime preparation from the pinned GitHub release failed.'
    }

    $verifyRuntime = Join-Path $ProjectRoot 'scripts/verify-runtime-manifest.ps1'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyRuntime -Mode Source -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        throw 'Runtime manifest verification after bootstrap failed.'
    }

    Write-Host "PULSARIA PINNED RUNTIME BOOTSTRAP: PASS ($bootstrapRelease, $bootstrapSha256)"
} finally {
    if ($bootstrapRootCreated -and (Test-Path -LiteralPath $bootstrapRoot)) {
        Assert-OwnedRunnerTempPath $bootstrapRoot
        try {
            Remove-Item -LiteralPath $bootstrapRoot -Recurse -Force -ErrorAction Stop
            Write-Host 'PULSARIA PINNED RUNTIME BOOTSTRAP CLEANUP: PASS'
        } catch {
            Write-Warning "Could not remove owned bootstrap temp directory $bootstrapRoot`: $($_.Exception.Message)"
        }
    }
}
