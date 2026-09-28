[CmdletBinding()]
param(
    [string]$ExecutablePath,
    [ValidateRange(5, 120)]
    [int]$HealthTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ExecutablePath)) {
    $ExecutablePath = Join-Path $PSScriptRoot '..\target-tauri\release\pulsaria.exe'
}

$executable = (Resolve-Path -LiteralPath $ExecutablePath).Path
$existing = @(Get-Process -Name 'pulsaria' -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
    throw 'Close the existing Pulsaria window before starting an isolated acceptance session.'
}

foreach ($port in @(8080, 9001)) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listenerStarted = $false
    $bindError = $null
    try {
        $listener.Start()
        $listenerStarted = $true
    } catch {
        $bindError = $_.Exception.Message
    } finally {
        if ($listenerStarted) {
            $listener.Stop()
        }
    }
    if (-not $listenerStarted) {
        throw "Loopback port $port is not available. Close its current owner before starting the isolated session. $bindError"
    }
}

$sessionId = [guid]::NewGuid().ToString('N')
$profileRoot = Join-Path $env:TEMP "pulsaria-phase2-$sessionId"
$profilePaths = @{
    APPDATA = Join-Path $profileRoot 'AppData'
    LOCALAPPDATA = Join-Path $profileRoot 'LocalAppData'
    PULSAR_DATA_DIR = Join-Path $profileRoot 'data'
    PULSAR_DOWNLOAD_DIR = Join-Path $profileRoot 'downloads'
}
$testEnvironment = @{
    APPDATA = $profilePaths.APPDATA
    LOCALAPPDATA = $profilePaths.LOCALAPPDATA
    PULSAR_DATA_DIR = $profilePaths.PULSAR_DATA_DIR
    PULSAR_DOWNLOAD_DIR = $profilePaths.PULSAR_DOWNLOAD_DIR
    PULSAR_API_HOST = '127.0.0.1'
    PULSAR_API_PORT = '8080'
    PULSAR_METRICS_PORT = '9001'
}

foreach ($path in $profilePaths.Values) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

$overrideNames = @(
    'APPDATA', 'LOCALAPPDATA', 'PULSAR_DATA_DIR', 'PULSAR_DOWNLOAD_DIR',
    'PULSAR_API_HOST', 'PULSAR_API_PORT', 'PULSAR_METRICS_PORT',
    'PULSAR_RUNTIME_ROOT', 'PYTHON_EXE',
    'PULSAR_PYTHON_PATH', 'FFMPEG_PATH', 'FFPROBE_PATH', 'YT_DLP_PATH',
    'WHISPER_MODEL_PATH', 'PULSAR_WHISPER_MODEL_DIR', 'ONNX_MODEL_DIR', 'TESSERACT_PATH'
)
$previousEnvironment = @{}
foreach ($name in $overrideNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$appProcess = $null
try {
    foreach ($name in $overrideNames) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    foreach ($name in $testEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $testEnvironment[$name], 'Process')
    }

    $appProcess = Start-Process `
        -FilePath $executable `
        -WorkingDirectory (Split-Path -Parent $executable) `
        -PassThru
} finally {
    foreach ($name in $overrideNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}

$health = $null
$healthError = 'Timed out waiting for GET http://127.0.0.1:8080/health.'
$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -Method Get -TimeoutSec 2
        break
    } catch {
        $healthError = $_.Exception.Message
        Start-Sleep -Milliseconds 500
    }
}

[pscustomobject]@{
    ProcessId = $appProcess.Id
    Executable = $executable
    IsolatedProfile = $profileRoot
    ApiHealth = if ($null -ne $health -and $health.status -eq 'ok') { 'PASS' } else { 'UNAVAILABLE' }
    ApiHealthDetail = if ($null -ne $health -and $health.status -eq 'ok') {
        "status=$($health.status); version=$($health.version)"
    } else {
        $healthError
    }
    Notes = 'The temporary profile is retained for inspection and is not removed by this script.'
}
