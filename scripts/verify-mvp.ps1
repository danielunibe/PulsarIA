$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    Write-Host '1/13 Frontend lint'
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed' }

    Write-Host '2/13 TypeScript contract'
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript contract failed' }

    Write-Host '3/13 Spanish/English locale contract'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-locale.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Locale contract failed' }

    Write-Host '4/13 Reproducible Next.js production build'
    # The development wrapper uses .next-dev, so the production verifier can
    # intentionally use Next's canonical .next output. Next 16/Turbopack has a
    # resolver regression when distDir is overridden to a sibling folder: the
    # Tailwind PostCSS plugin is then resolved from the workspace parent and
    # emits a false "Can't resolve tailwindcss" diagnostic. Keep the optional
    # NEXT_DIST_DIR support for other callers, but never force it in this gate.
    $previousNextDistDir = $env:NEXT_DIST_DIR
    Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Next.js build failed' }
    } finally {
        if ($null -eq $previousNextDistDir) {
            Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
        } else {
            $env:NEXT_DIST_DIR = $previousNextDistDir
        }
    }

    Write-Host '5/13 Rust formatting contract'
    cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
    if ($LASTEXITCODE -ne 0) { throw 'Rust formatting failed' }

    Write-Host '6/13 Rust checks and regression tests'
    cargo check --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Rust check failed' }
    # Real sidecar inference tests share a local CPU runtime. Keep the broad
    # regression suite lightweight, then execute each live model test alone so
    # sidecar startup and controlled model switching have the full CPU budget.
    $previousRustTestThreads = $env:RUST_TEST_THREADS
    $env:RUST_TEST_THREADS = '1'
    try {
        cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1 --skip test_8_real_llama_server_runtime_execution --skip test_16_real_runtime_controlled_model_switch
        if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }

        $realRuntimeTests = @(
            'application::routed_execution::tests::test_8_real_llama_server_runtime_execution',
            'application::routed_execution::tests::test_16_real_runtime_controlled_model_switch'
        )
        foreach ($test in $realRuntimeTests) {
            Write-Host "Running isolated live runtime test: $test"
            cargo test --manifest-path src-tauri/Cargo.toml $test -- --exact --nocapture --test-threads=1
            if ($LASTEXITCODE -ne 0) { throw "Rust live runtime test failed: $test" }
        }
    } finally {
        if ($null -eq $previousRustTestThreads) {
            Remove-Item Env:RUST_TEST_THREADS -ErrorAction SilentlyContinue
        } else {
            $env:RUST_TEST_THREADS = $previousRustTestThreads
        }
    }

    Write-Host '7/13 Offline Python and packaging contracts'
    npm run test:python
    if ($LASTEXITCODE -ne 0) { throw 'Python tests failed' }

    Write-Host '8/13 Frontend secret and cloud boundary'
    npm run verify:frontend-secrets
    if ($LASTEXITCODE -ne 0) { throw 'Frontend secret boundary failed' }

    Write-Host '9/13 API loopback security contract'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-api-loopback.ps1
    if ($LASTEXITCODE -ne 0) { throw 'API loopback gate failed' }

    Write-Host '10/13 Canonical source and artifact structure'
    npm run verify:canonical
    if ($LASTEXITCODE -ne 0) { throw 'Canonical structure gate failed' }

    Write-Host '11/13 Release bundle resource contract'
    $config = Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
    $workerMappings = @($config.bundle.resources.PSObject.Properties | Where-Object { $_.Name -like '../python-workers/*.py' })
    if ($workerMappings.Count -lt 11) { throw 'Canonical Python worker mappings are incomplete' }
    $legalResourceMappings = @($config.bundle.resources.PSObject.Properties | Where-Object { [string]$_.Value -like 'resources/legal/*' })
    if ($legalResourceMappings.Count -lt 13) { throw 'Bundled license, privacy, EULA, content, model, or third-party notice resources are incomplete' }
    foreach ($mapping in $legalResourceMappings) {
        if (-not (Test-Path -LiteralPath (Join-Path (Join-Path (Get-Location).Path 'src-tauri') ([string]$mapping.Name)) -PathType Leaf)) {
            throw "Bundled legal resource source is missing: $($mapping.Name)"
        }
    }
    $duplicateWorkers = @(Get-ChildItem -LiteralPath 'src-tauri/resources/python-workers' -Filter '*.py' -ErrorAction SilentlyContinue)
    if ($duplicateWorkers.Count -ne 0) { throw 'Duplicated packaged Python worker sources detected' }

    Write-Host '12/13 Reproducible runtime manifest and bundled media tools'
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-runtime-manifest.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Runtime resource manifest failed; required resources, including ffprobe.exe, must be present' }

    Write-Host '13/13 Onboarding legal and progressive-flow contract'
    npm run verify:onboarding
    if ($LASTEXITCODE -ne 0) { throw 'Onboarding contract failed' }

    Write-Host 'PULSARIA MVP AUTOMATED GATES: PASS (13/13)'
}
finally {
    Pop-Location
}
