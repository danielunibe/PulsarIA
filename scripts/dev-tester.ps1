[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$versionContract = Join-Path $projectRoot 'scripts/verify-version-contract.ps1'
$previousRuntimeProfile = $env:PULSARIA_RUNTIME_PROFILE

try {
    Write-Host 'Pulsaria TESTER DEV: frontend hot reload sin compilacion de Tauri/Rust.'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $versionContract
    if ($LASTEXITCODE -ne 0) {
        throw 'La version canonica no esta sincronizada; corrige el contrato antes de iniciar TESTER DEV.'
    }

    $env:PULSARIA_RUNTIME_PROFILE = 'tester-dev'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'scripts/sync-demo-media.ps1') -Clean
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo sincronizar el material DEMO. Revisa C:\Users\danie\Desktop\imagenes pulsaria.'
    }
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'scripts/dev-next.ps1')
    exit $LASTEXITCODE
} finally {
    if ($null -eq $previousRuntimeProfile) {
        Remove-Item Env:PULSARIA_RUNTIME_PROFILE -ErrorAction SilentlyContinue
    } else {
        $env:PULSARIA_RUNTIME_PROFILE = $previousRuntimeProfile
    }
}
