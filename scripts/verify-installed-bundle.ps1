[CmdletBinding()]
param(
    [ValidateSet('nsis', 'msi')]
    [string]$Bundle = 'nsis',
    [ValidateSet('debug', 'release')]
    [string]$Configuration = 'debug',
    [switch]$RunLive,
    [string]$TikTokUrl = 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    [int]$ApiPort = 18874,
    [int]$StartupTimeoutSeconds = 90,
    [int]$JobTimeoutSeconds = 360
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tauriConfigPath = Join-Path $projectRoot 'src-tauri/tauri.conf.json'
$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$expectedVersion = [string]$tauriConfig.version
$bundleRoot = Join-Path $projectRoot "target-tauri/$Configuration/bundle"
$bundlePath = if ($Bundle -eq 'nsis') {
    (Get-ChildItem -LiteralPath (Join-Path $bundleRoot 'nsis') -Filter 'pulsaria_*_x64-setup.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
} else {
    (Get-ChildItem -LiteralPath (Join-Path $bundleRoot 'msi') -Filter 'pulsaria_*_x64_en-US.msi' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
}

if ([string]::IsNullOrWhiteSpace($bundlePath) -or -not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) {
    throw "Bundle not found under $bundleRoot for $Bundle"
}

if ($Bundle -eq 'msi') {
    throw 'MSI installation automation is intentionally not enabled by this script; use the NSIS path or a controlled MSI test host.'
}

function Get-JobList {
    param([object]$Body)

    if ($null -ne $Body.jobs) { return @($Body.jobs) }
    if ($null -ne $Body.data) { return @($Body.data) }
    return @($Body)
}

function Get-Sha256Hex {
    param([string]$Path)

    $getFileHash = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($null -ne $getFileHash) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Find-Job {
    param([object[]]$Jobs, [int64]$JobId)

    return @($Jobs | Where-Object {
        ([int64]$_.id -eq $JobId) -or ([int64]$_.job_id -eq $JobId)
    } | Select-Object -First 1)
}

function Test-ModelFile {
    param([string]$Path, [int64]$MinimumBytes)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    try {
        $file = Get-Item -LiteralPath $Path -Force
        if ($file.Length -ge $MinimumBytes) {
            return $true
        }
        $pointer = [System.IO.File]::ReadAllText($Path).Trim()
        if (-not $pointer.StartsWith('../../blobs/', [System.StringComparison]::Ordinal)) {
            return $false
        }
        $blobPath = Join-Path $file.DirectoryName $pointer
        return (Test-Path -LiteralPath $blobPath -PathType Leaf) -and
            ((Get-Item -LiteralPath $blobPath -Force).Length -ge $MinimumBytes)
    } catch {
        return $false
    }
}

function Assert-OwnedTempPath {
    param([string]$Path, [string]$Tag)

    $resolved = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
    if (-not $resolved.StartsWith("$tempRoot\pulsaria-current-bundle-", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside the test-owned TEMP prefix: $resolved"
    }
    if (-not $resolved.EndsWith("-$Tag", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove an unexpected test path: $resolved"
    }
}

$tag = [guid]::NewGuid().ToString('N')
$installDir = Join-Path $env:TEMP "pulsaria-current-bundle-install-$tag"
$dataDir = Join-Path $env:TEMP "pulsaria-current-bundle-data-$tag"
$downloadsDir = Join-Path $env:TEMP "pulsaria-current-bundle-downloads-$tag"
$baseUrl = "http://127.0.0.1:$ApiPort"
$envNames = @('PULSAR_DATA_DIR', 'PULSAR_DOWNLOAD_DIR', 'PULSAR_API_PORT', 'PULSAR_API_HOST')
$oldEnvironment = @{}
foreach ($name in $envNames) {
    $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$appProcess = $null
$result = [ordered]@{
    bundle = $bundlePath
    bundleSha256 = Get-Sha256Hex $bundlePath
    installExit = $null
    appPath = $null
    resourceChecks = [ordered]@{}
    runtimeManifestGate = $null
    health = $null
    restartHealth = $null
    initialJobCount = $null
    ingest = $null
    duplicateIngest = $null
    invalidIngest = $null
    literalSearch = $null
    semanticSearch = $null
    finalJob = $null
    outputFiles = @()
    restartJob = $null
    uninstallExit = $null
    cleanup = $false
    error = $null
}

try {
    New-Item -ItemType Directory -Path $installDir, $dataDir, $downloadsDir -Force | Out-Null
    $installResult = Start-Process -FilePath $bundlePath -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
    $result.installExit = $installResult.ExitCode
    if ($installResult.ExitCode -ne 0) {
        throw "NSIS install exited with code $($installResult.ExitCode)"
    }

    $productSlug = ([string]$tauriConfig.productName -replace '[^A-Za-z0-9._-]', '')
    if ([string]::IsNullOrWhiteSpace($productSlug)) {
        throw 'Tauri productName is empty or cannot be converted into a safe executable name'
    }
    $appPath = Join-Path $installDir "$productSlug.exe"
    if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
        $appPath = (Get-ChildItem -LiteralPath $installDir -Filter '*.exe' -File -Recurse |
            Where-Object { $_.Name -notmatch '^(?i:uninstall|un\.exe)' } |
            Select-Object -First 1).FullName
    }
    if (-not $appPath -or -not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
        throw "Installed $productSlug.exe was not found"
    }
    $result.appPath = $appPath

    $installedResourceRoot = Join-Path $installDir 'resources'
    $runtimeManifestPath = Join-Path $installedResourceRoot 'runtime-manifest.json'
    $result.resourceChecks.runtimeManifest = Test-Path -LiteralPath $runtimeManifestPath -PathType Leaf
    $result.resourceChecks.python = Test-Path -LiteralPath (Join-Path $installedResourceRoot 'python/python.exe')
    $result.resourceChecks.worker = Test-Path -LiteralPath (Join-Path $installedResourceRoot 'python-workers/main.py')
    $result.resourceChecks.ffmpeg = Test-Path -LiteralPath (Join-Path $installedResourceRoot 'bin/ffmpeg.exe')
    $result.resourceChecks.ffprobe = Test-Path -LiteralPath (Join-Path $installedResourceRoot 'bin/ffprobe.exe')
    $result.resourceChecks.ffmpegLicense = Test-Path -LiteralPath (Join-Path $installedResourceRoot 'bin/FFMPEG-LICENSE.txt')
    $onnxModelDir = Join-Path $installDir 'resources/assets/models/all-MiniLM-L6-v2'
    $whisperModelDir = Join-Path $installDir 'resources/assets/models/models--Systran--faster-whisper-tiny/snapshots/d90ca5fe260221311c53c58e660288d3deb8d356'
    $result.resourceChecks.onnx = (Test-ModelFile (Join-Path $onnxModelDir 'model.onnx') 1000000) -and
        (Test-ModelFile (Join-Path $onnxModelDir 'tokenizer.json') 128)
    $result.resourceChecks.whisper = (Test-ModelFile (Join-Path $whisperModelDir 'config.json') 128) -and
        (Test-ModelFile (Join-Path $whisperModelDir 'model.bin') 10000000) -and
        (Test-ModelFile (Join-Path $whisperModelDir 'tokenizer.json') 128) -and
        (Test-ModelFile (Join-Path $whisperModelDir 'vocabulary.txt') 128)
    if ($result.resourceChecks.runtimeManifest) {
        $runtimeManifestOutput = @(& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'scripts/verify-runtime-manifest.ps1') -Mode Installed -ResourceRoot $installedResourceRoot -ManifestPath $runtimeManifestPath 2>&1)
        $runtimeManifestExitCode = $LASTEXITCODE
        $result.runtimeManifestGate = @($runtimeManifestOutput | ForEach-Object { [string]$_ })
        if ($runtimeManifestExitCode -ne 0) {
            throw 'Installed runtime manifest gate is BLOCKED; required resources, including ffprobe.exe, are not verified'
        }
    } else {
        $result.runtimeManifestGate = @('BLOCKED: resources/runtime-manifest.json is missing from the installed bundle')
    }
    if (-not ($result.resourceChecks.runtimeManifest -and $result.resourceChecks.python -and $result.resourceChecks.worker -and $result.resourceChecks.ffmpeg -and $result.resourceChecks.ffprobe -and $result.resourceChecks.ffmpegLicense -and $result.resourceChecks.onnx -and $result.resourceChecks.whisper)) {
        throw 'One or more packaged runtime resources are missing; ffmpeg.exe, ffprobe.exe and local license evidence are required'
    }

    [Environment]::SetEnvironmentVariable('PULSAR_DATA_DIR', $dataDir, 'Process')
    [Environment]::SetEnvironmentVariable('PULSAR_DOWNLOAD_DIR', $downloadsDir, 'Process')
    [Environment]::SetEnvironmentVariable('PULSAR_API_PORT', "$ApiPort", 'Process')
    [Environment]::SetEnvironmentVariable('PULSAR_API_HOST', '127.0.0.1', 'Process')
    $appProcess = Start-Process -FilePath $appPath -WorkingDirectory $installDir -WindowStyle Hidden -PassThru

    $health = $null
    for ($i = 0; $i -lt $StartupTimeoutSeconds; $i++) {
        try {
            $health = Invoke-RestMethod -Method Get -Uri "$baseUrl/health" -TimeoutSec 5
            if ($null -ne $health) { break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if ($null -eq $health) {
        throw "Installed app did not expose /health within $StartupTimeoutSeconds seconds"
    }
    $result.health = $health
    if ([string]$health.version -ne $expectedVersion) {
        throw "Installed health version $($health.version) does not match expected $expectedVersion"
    }
    $initialJobs = Get-JobList (Invoke-RestMethod -Method Get -Uri "$baseUrl/api/v1/jobs" -TimeoutSec 10)
    $result.initialJobCount = $initialJobs.Count

    if ($RunLive) {
        $payload = @{ url = $TikTokUrl } | ConvertTo-Json -Compress
        $result.ingest = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/ingest" -ContentType 'application/json' -Body $payload -TimeoutSec 30
        $jobId = [int64]$result.ingest.job_id
        $finalJob = $null
        $pollCount = [Math]::Ceiling($JobTimeoutSeconds / 5)
        for ($i = 0; $i -lt $pollCount; $i++) {
            try {
                $jobs = Get-JobList (Invoke-RestMethod -Method Get -Uri "$baseUrl/api/v1/jobs" -TimeoutSec 10)
                $candidate = Find-Job $jobs $jobId
                if ($candidate -is [array] -and $candidate.Count -gt 0) { $candidate = $candidate[0] }
                if ($null -ne $candidate) { $finalJob = $candidate }
                if ($null -ne $finalJob -and "$($finalJob.status)" -in @('complete', 'completed', 'error', 'failed')) { break }
            } catch { }
            Start-Sleep -Seconds 5
        }
        $result.finalJob = [ordered]@{
            id = $finalJob.id
            status = $finalJob.status
            progress = $finalJob.progress
            title = $finalJob.title
            videoPath = $finalJob.video_path
            hasVisualAnalysis = -not [string]::IsNullOrWhiteSpace([string]$finalJob.visual_analysis)
            hasInstructionalGuide = -not [string]::IsNullOrWhiteSpace([string]$finalJob.instructional_guide)
        }
        if ($null -eq $finalJob -or "$($finalJob.status)" -notin @('complete', 'completed')) {
            throw "Installed live job did not complete successfully (status=$($finalJob.status))"
        }

        $duplicatePayload = @{ url = $TikTokUrl } | ConvertTo-Json -Compress
        $duplicateResponse = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/ingest" -ContentType 'application/json' -Body $duplicatePayload -TimeoutSec 30
        $result.duplicateIngest = $duplicateResponse
        if ([int64]$duplicateResponse.job_id -ne $jobId -or "$($duplicateResponse.status)" -ne 'existing') {
            throw 'Duplicate TikTok ingest did not resolve to the original job'
        }

        try {
            $invalidPayload = @{ url = 'https://example.com/not-a-tiktok-video' } | ConvertTo-Json -Compress
            $invalidResponse = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/ingest" -ContentType 'application/json' -Body $invalidPayload -TimeoutSec 30
            $result.invalidIngest = [ordered]@{ accepted = $true; response = $invalidResponse }
            throw 'Invalid URL was accepted by the installed ingest endpoint'
        } catch {
            if ($_.Exception.Message -like '*Invalid URL was accepted*') { throw }
            $statusCode = $null
            try { $statusCode = [int]$_.Exception.Response.StatusCode.value__ } catch { }
            $result.invalidIngest = [ordered]@{ accepted = $false; statusCode = $statusCode }
            if ($null -eq $statusCode -or $statusCode -lt 400 -or $statusCode -ge 500) {
                throw 'Invalid URL did not return a client error from the installed ingest endpoint'
            }
        }

        foreach ($search in @(
            @{ Name = 'literalSearch'; Uri = "$baseUrl/api/v1/search/literal" },
            @{ Name = 'semanticSearch'; Uri = "$baseUrl/api/v1/search" }
        )) {
            $searchPayload = @{ query = 'Scramble'; limit = 10 } | ConvertTo-Json -Compress
            $searchResponse = Invoke-RestMethod -Method Post -Uri $search.Uri -ContentType 'application/json' -Body $searchPayload -TimeoutSec 30
            $hasResultsProperty = $null -ne $searchResponse -and
                ($searchResponse.PSObject.Properties.Name -contains 'results')
            $searchResults = if ($hasResultsProperty) {
                if ($null -eq $searchResponse.results) { @() } else { @($searchResponse.results) }
            } elseif ($searchResponse -is [System.Array]) {
                @($searchResponse)
            } else {
                $null
            }
            $shapeValid = $hasResultsProperty -or $searchResponse -is [System.Array]
            $result[$search.Name] = [ordered]@{ resultCount = if ($null -eq $searchResults) { $null } else { $searchResults.Count }; shapeValid = $shapeValid }
            if (-not $shapeValid) {
                throw "$($search.Name) response did not contain a results array"
            }
        }
        $result.outputFiles = @(Get-ChildItem -LiteralPath $downloadsDir -Recurse -File -ErrorAction SilentlyContinue | Select-Object Name, Length, FullName)
    }

    Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    try { [void]$appProcess.WaitForExit(15000) } catch { }
    $appProcess = $null
    Start-Sleep -Seconds 2
    $appProcess = Start-Process -FilePath $appPath -WorkingDirectory $installDir -WindowStyle Hidden -PassThru
    $healthAfterRestart = $null
    for ($i = 0; $i -lt $StartupTimeoutSeconds; $i++) {
        try {
            $healthAfterRestart = Invoke-RestMethod -Method Get -Uri "$baseUrl/health" -TimeoutSec 5
            if ($null -ne $healthAfterRestart) { break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if ($null -eq $healthAfterRestart) {
        throw "Installed app did not recover /health after restart within $StartupTimeoutSeconds seconds"
    }
    $result.restartHealth = $healthAfterRestart
    if ([string]$healthAfterRestart.version -ne $expectedVersion) {
        throw "Restart health version $($healthAfterRestart.version) does not match expected $expectedVersion"
    }
    if ($RunLive) {
        $restartJobs = Get-JobList (Invoke-RestMethod -Method Get -Uri "$baseUrl/api/v1/jobs" -TimeoutSec 10)
        $restartJob = Find-Job $restartJobs ([int64]$result.ingest.job_id)
        if ($restartJob -is [array] -and $restartJob.Count -gt 0) { $restartJob = $restartJob[0] }
        if ($null -ne $restartJob) {
            $result.restartJob = [ordered]@{
                id = $restartJob.id
                status = $restartJob.status
                progress = $restartJob.progress
                videoPath = $restartJob.video_path
                hasVisualAnalysis = -not [string]::IsNullOrWhiteSpace([string]$restartJob.visual_analysis)
            }
        }
        if ($null -eq $restartJob -or "$($restartJob.status)" -notin @('complete', 'completed')) {
            throw 'Persisted completed job was not visible after installed-app restart'
        }
    }
} catch {
    $result.error = $_.Exception.Message
} finally {
    if ($null -ne $appProcess) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
        try { [void]$appProcess.WaitForExit(15000) } catch { }
    }
    foreach ($name in $envNames) {
        if ($null -eq $oldEnvironment[$name]) {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process')
        }
    }

    $uninstallerPath = (Get-ChildItem -LiteralPath $installDir -Filter '*uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
    if ($uninstallerPath -and (Test-Path -LiteralPath $uninstallerPath -PathType Leaf)) {
        try {
            $uninstallResult = Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Wait -PassThru
            $result.uninstallExit = $uninstallResult.ExitCode
        } catch {
            $result.uninstallExit = "error: $($_.Exception.Message)"
        }
    }

    $clean = $true
    foreach ($path in @($installDir, $dataDir, $downloadsDir)) {
        Assert-OwnedTempPath $path $tag
        if (Test-Path -LiteralPath $path) {
            try {
                Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
            } catch {
                $clean = $false
            }
        }
    }
    $result.cleanup = $clean
}

$result | ConvertTo-Json -Depth 8

# Emit the diagnostic JSON first, but make the verifier fail in CI when the
# JSON contains an error or when install/uninstall/cleanup did not complete.
# Previously the catch block only populated $result.error, so a broken
# installation could still return exit code 0.
$uninstallFailed = $null -eq $result.uninstallExit -or "$($result.uninstallExit)" -ne '0'
$verificationFailed = (-not [string]::IsNullOrWhiteSpace([string]$result.error)) -or
    $null -eq $result.installExit -or $result.installExit -ne 0 -or
    $uninstallFailed -or -not [bool]$result.cleanup
if ($verificationFailed) {
    exit 1
}
