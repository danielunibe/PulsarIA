$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $configured = @($env:PULSAR_PYTHON_PATH, $env:PYTHON_EXE) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -First 1

    $candidates = @()
    if ($configured) {
        $candidates += $configured
    }
    $candidates += @(
        (Join-Path $projectRoot 'python-workers\.venv\Scripts\python.exe'),
        (Join-Path $projectRoot 'src-tauri\resources\python\python.exe')
    )

    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notlike '*WindowsApps*' } |
        Select-Object -First 1
    if ($systemPython) {
        $candidates += $systemPython.Source
    }

    $pythonExe = $null
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $pythonExe = (Resolve-Path -LiteralPath $candidate).Path
            break
        }
    }

    if (-not $pythonExe) {
        throw 'No se encontró un intérprete Python ejecutable. Configure PULSAR_PYTHON_PATH o ejecute python-workers/setup.ps1.'
    }

    Write-Host "Python de pruebas: $pythonExe"
    & $pythonExe -m unittest discover -s python-workers -p 'test_*.py' -v
    if ($LASTEXITCODE -ne 0) {
        throw "Las pruebas Python fallaron con código $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
