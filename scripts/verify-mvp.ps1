$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    Write-Host '1/12 Frontend lint'
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed' }

    Write-Host '2/12 TypeScript contract'
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript contract failed' }

    Write-Host '3/12 Spanish/English locale contract'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-locale.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Locale contract failed' }

    Write-Host '4/12 Reproducible Next.js production build'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Next.js build failed' }

    Write-Host '5/12 Rust formatting contract'
    cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
    if ($LASTEXITCODE -ne 0) { throw 'Rust formatting failed' }

    Write-Host '6/12 Rust checks and regression tests'
    cargo check --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Rust check failed' }
    cargo test --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }

    Write-Host '7/12 Offline Python and packaging contracts'
    npm run test:python
    if ($LASTEXITCODE -ne 0) { throw 'Python tests failed' }

    Write-Host '8/12 Frontend secret and cloud boundary'
    npm run verify:frontend-secrets
    if ($LASTEXITCODE -ne 0) { throw 'Frontend secret boundary failed' }

    Write-Host '9/12 API loopback security contract'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-api-loopback.ps1
    if ($LASTEXITCODE -ne 0) { throw 'API loopback gate failed' }

    Write-Host '10/12 Canonical source and artifact structure'
    npm run verify:canonical
    if ($LASTEXITCODE -ne 0) { throw 'Canonical structure gate failed' }

    Write-Host '11/12 Release bundle resource contract'
    $config = Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
    $workerMappings = @($config.bundle.resources.PSObject.Properties | Where-Object { $_.Name -like '../python-workers/*.py' })
    if ($workerMappings.Count -lt 11) { throw 'Canonical Python worker mappings are incomplete' }
    $duplicateWorkers = @(Get-ChildItem -LiteralPath 'src-tauri/resources/python-workers' -Filter '*.py' -ErrorAction SilentlyContinue)
    if ($duplicateWorkers.Count -ne 0) { throw 'Duplicated packaged Python worker sources detected' }

    Write-Host '12/12 Reproducible runtime manifest and bundled media tools'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Runtime resource manifest failed; required resources, including ffprobe.exe, must be present' }

    Write-Host 'PULSARIA MVP AUTOMATED GATES: PASS (12/12)'
}
finally {
    Pop-Location
}
