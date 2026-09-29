param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$canonicalMarker = 'pulsaria-frontend" content="beta3-canonical'
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$canonicalVersion = [string]$packageJson.version
$canonicalVersionMarker = 'pulsaria-version" content="' + $canonicalVersion
$runtimeProfile = if ([string]::IsNullOrWhiteSpace($env:PULSARIA_RUNTIME_PROFILE)) { 'frontend-dev' } else { [string]$env:PULSARIA_RUNTIME_PROFILE }
$runtimeProfileMarker = 'pulsaria-runtime-profile" content="' + $runtimeProfile
$versionContract = Join-Path $projectRoot 'scripts/verify-version-contract.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $versionContract
if ($LASTEXITCODE -ne 0) { throw 'La version del frontend y el runtime no esta sincronizada; no se iniciara el tester.' }
if ($Port -ne 3000) {
    throw "El frontend de desarrollo de Pulsaria esta fijado a http://127.0.0.1:3000; no se permite iniciar otra instancia en el puerto $Port."
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)

if ($listeners.Count -gt 0) {
    $owners = foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($process) {
            "PID $($process.ProcessId): $($process.CommandLine)"
        } else {
            "PID $($listener.OwningProcess)"
        }
    }

    $sameCheckout = @($listeners | ForEach-Object {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
        $process -and $process.CommandLine -and $process.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }) -contains $true
    $kind = if ($sameCheckout) { 'una instancia anterior de este checkout' } else { 'otra aplicacion' }
    throw "El puerto $Port ya esta ocupado por $kind. No se cambiara silenciosamente a otro puerto. Deten el proceso y vuelve a ejecutar Pulsaria.`n$($owners -join "`n")"
}

$nextBin = Join-Path $projectRoot 'node_modules\.bin\next.cmd'
if (-not (Test-Path -LiteralPath $nextBin -PathType Leaf)) {
    throw "No se encontró Next.js en $nextBin. Ejecuta npm ci desde la raíz de Pulsaria."
}

Write-Host "Pulsaria dev frontend: http://127.0.0.1:$Port"
Write-Host "Perfil: $runtimeProfile | Version: $canonicalVersion | Sin compilacion Tauri"
$previousNextDistDir = $env:NEXT_DIST_DIR
$previousRuntimeProfile = $env:PULSARIA_RUNTIME_PROFILE
$env:PULSARIA_RUNTIME_PROFILE = $runtimeProfile
$env:NEXT_DIST_DIR = '.next-dev'
$nextProcess = $null
$startupReady = $false
try {
    $nextProcess = Start-Process -FilePath $nextBin -ArgumentList @('dev', '-p', $Port, '-H', '127.0.0.1') -WorkingDirectory $projectRoot -NoNewWindow -PassThru
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
            if ($response.StatusCode -eq 200 -and
                $response.Content -match [regex]::Escape($canonicalMarker) -and
                $response.Content -match [regex]::Escape($canonicalVersionMarker) -and
                $response.Content -match [regex]::Escape($runtimeProfileMarker)) {
                $startupReady = $true
                break
            }
        } catch {
            # Next todavía está compilando la primera página.
        }
        if ($nextProcess.HasExited) {
            throw "Next.js termino antes de servir el frontend canonico en http://127.0.0.1:$Port."
        }
    }
    if (-not $startupReady) {
        throw "Next.js no sirvio el marcador beta3-canonical en el puerto $Port dentro del tiempo esperado."
    }
    Write-Host "Frontend canonico listo: http://127.0.0.1:$Port"
    $nextProcess.WaitForExit()
    exit $nextProcess.ExitCode
} finally {
    if ($nextProcess -and -not $nextProcess.HasExited -and -not $startupReady) {
        Stop-Process -Id $nextProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -eq $previousNextDistDir) {
        Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    } else {
        $env:NEXT_DIST_DIR = $previousNextDistDir
    }
    if ($null -eq $previousRuntimeProfile) {
        Remove-Item Env:PULSARIA_RUNTIME_PROFILE -ErrorAction SilentlyContinue
    } else {
        $env:PULSARIA_RUNTIME_PROFILE = $previousRuntimeProfile
    }
}
exit $LASTEXITCODE
