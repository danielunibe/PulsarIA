[CmdletBinding()]
param(
    [ValidateSet('Source', 'Installed')]
    [string]$Mode = 'Source',
    [string]$ProjectRoot,
    [string]$ResourceRoot,
    [string]$ManifestPath,
    [string]$ArtifactRoot,
    [switch]$RequireArtifacts
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
} else {
    $ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}

if ([string]::IsNullOrWhiteSpace($ResourceRoot)) {
    if ($Mode -eq 'Source') {
        $ResourceRoot = Join-Path $ProjectRoot 'src-tauri/resources'
    } elseif (-not [string]::IsNullOrWhiteSpace($ManifestPath)) {
        $ResourceRoot = Split-Path -Parent ([System.IO.Path]::GetFullPath($ManifestPath))
    } else {
        throw 'Installed mode requires -ResourceRoot or -ManifestPath.'
    }
} else {
    $ResourceRoot = [System.IO.Path]::GetFullPath($ResourceRoot)
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $ResourceRoot 'runtime-manifest.json'
} else {
    $ManifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
}

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    Write-Error "PULSARIA RUNTIME RESOURCE GATE: BLOCKED - runtime manifest not found: $ManifestPath"
    exit 1
}

try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
} catch {
    Write-Error "PULSARIA RUNTIME RESOURCE GATE: BLOCKED - invalid JSON in ${ManifestPath}: $($_.Exception.Message)"
    exit 1
}

$blockers = New-Object 'System.Collections.Generic.List[string]'
$checked = New-Object 'System.Collections.Generic.List[object]'
$seenPaths = @{}

function ConvertTo-ManifestPath {
    param([string]$Path)

    return ($Path -replace '\\', '/')
}

function Get-EffectiveFileLength {
    param([System.IO.FileInfo]$File)

    if ([string]::IsNullOrWhiteSpace([string]$File.LinkType)) {
        return [int64]$File.Length
    }
    $targetValues = @($File.Target)
    if ($targetValues.Count -eq 0 -or [string]::IsNullOrWhiteSpace([string]$targetValues[0])) {
        throw "Resource link has no target: $($File.FullName)"
    }
    $target = [string]$targetValues[0]
    $resolvedTarget = if ([System.IO.Path]::IsPathRooted($target)) {
        [System.IO.Path]::GetFullPath($target)
    } else {
        [System.IO.Path]::GetFullPath((Join-Path $File.DirectoryName $target))
    }
    $targetFile = Get-Item -LiteralPath $resolvedTarget -Force -ErrorAction Stop
    if ($targetFile.PSIsContainer) {
        throw "Resource link target is a directory: $resolvedTarget"
    }
    return [int64]$targetFile.Length
}

function Get-ActualPath {
    param([object]$FileRecord)

    if ($Mode -eq 'Source') {
        if ([string]::IsNullOrWhiteSpace([string]$FileRecord.sourcePath)) {
            return $null
        }
        return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot ([string]$FileRecord.sourcePath -replace '/', '\')))
    }
    if ([string]::IsNullOrWhiteSpace([string]$FileRecord.path)) {
        return $null
    }
    return [System.IO.Path]::GetFullPath((Join-Path $ResourceRoot ([string]$FileRecord.path -replace '/', '\')))
}

function Get-Sha256Hex {
    param([string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToUpperInvariant()
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Add-Blocker {
    param([string]$Message)

    if (-not [string]::IsNullOrWhiteSpace($Message)) {
        $blockers.Add($Message)
    }
}

if ([string]$manifest.manifestKind -ne 'pulsaria-runtime-resources') {
    Add-Blocker 'Manifest kind is not pulsaria-runtime-resources'
}
if ([string]$manifest.platform -ne 'windows-x86_64') {
    Add-Blocker "Manifest platform is not windows-x86_64: $($manifest.platform)"
}
if ([string]$manifest.contract.status -ne 'PASS') {
    Add-Blocker "Manifest contract status is $($manifest.contract.status); regenerate the manifest after resolving every blocker"
}
foreach ($manifestBlocker in @($manifest.contract.blockers)) {
    Add-Blocker "Manifest blocker: $manifestBlocker"
}

if ($Mode -eq 'Source') {
    $manifestComponents = @($manifest.components)
    $manifestRecords = @($manifestComponents | ForEach-Object { @($_.files) })
    $configPath = Join-Path $ProjectRoot 'src-tauri/tauri.conf.json'
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        Add-Blocker "Tauri configuration not found: $configPath"
    } else {
        try {
            $tauriConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            if ([string]$tauriConfig.version -ne [string]$manifest.version) {
                Add-Blocker "Manifest version $($manifest.version) does not match tauri.conf.json version $($tauriConfig.version)"
            }
            $runtimeMapping = @($tauriConfig.bundle.resources.PSObject.Properties |
                Where-Object {
                    ([string]$_.Name -eq 'resources/runtime-manifest.json' -and [string]$_.Value -eq 'resources/runtime-manifest.json') -or
                    ([string]$_.Name -eq 'runtime-manifest.json' -and [string]$_.Value -eq 'resources/runtime-manifest.json')
                })
            if ($runtimeMapping.Count -eq 0) {
                Add-Blocker 'tauri.conf.json does not map src-tauri/resources/runtime-manifest.json into resources/runtime-manifest.json'
            }

            $requiredMappings = @(
                @{ source = 'resources/python'; destination = 'resources/python' },
                @{ source = 'resources/assets'; destination = 'resources/assets' },
                @{ source = 'resources/bin'; destination = 'resources/bin' },
                @{ source = 'resources/runtime-manifest.json'; destination = 'resources/runtime-manifest.json' }
            )
            foreach ($mapping in $requiredMappings) {
                $foundMapping = @($tauriConfig.bundle.resources.PSObject.Properties | Where-Object {
                    [string]$_.Name -eq $mapping.source -and [string]$_.Value -eq $mapping.destination
                })
                if ($foundMapping.Count -eq 0) {
                    Add-Blocker "tauri.conf.json is missing resource mapping $($mapping.source) -> $($mapping.destination)"
                }
            }

            $mappedWorkers = @($tauriConfig.bundle.resources.PSObject.Properties |
                Where-Object { [string]$_.Name -like '../python-workers/*.py' } |
                ForEach-Object {
                    $sourcePath = ConvertTo-ManifestPath ([string]$_.Name)
                    $destinationPath = ConvertTo-ManifestPath ([string]$_.Value)
                    if ($destinationPath.StartsWith('resources/', [System.StringComparison]::OrdinalIgnoreCase)) {
                        $destinationPath = $destinationPath.Substring('resources/'.Length)
                    }
                    [pscustomobject]@{
                        sourcePath = $sourcePath.Substring('../'.Length)
                        path = $destinationPath
                    }
                } | Sort-Object path)
            $manifestWorkers = @($manifestRecords | Where-Object { [string]$_.path -like 'python-workers/*.py' })
            foreach ($mappedWorker in $mappedWorkers) {
                $workerRecord = @($manifestWorkers | Where-Object {
                    [string]$_.sourcePath -eq $mappedWorker.sourcePath -and [string]$_.path -eq $mappedWorker.path
                })
                if ($workerRecord.Count -eq 0) {
                    Add-Blocker "runtime-manifest.json is missing mapped worker $($mappedWorker.sourcePath) -> $($mappedWorker.path)"
                }
            }
            foreach ($manifestWorker in $manifestWorkers) {
                $mappedWorker = @($mappedWorkers | Where-Object {
                    [string]$_.sourcePath -eq [string]$manifestWorker.sourcePath -and [string]$_.path -eq [string]$manifestWorker.path
                })
                if ($mappedWorker.Count -eq 0) {
                    Add-Blocker "runtime-manifest.json contains an unmapped worker: $($manifestWorker.path)"
                }
            }
        } catch {
            Add-Blocker "Unable to validate tauri.conf.json: $($_.Exception.Message)"
        }
    }
}

$components = @($manifest.components)
$allRecords = @()
foreach ($component in $components) {
    if ([string]$component.required -and [string]$component.status -ne 'ready') {
        Add-Blocker "Component $($component.id) is not ready: $($component.status)"
    }
    foreach ($file in @($component.files)) {
        $allRecords += $file
    }
}

$ffmpegRecord = $allRecords | Where-Object { [string]$_.path -eq 'bin/ffmpeg.exe' } | Select-Object -First 1
$ffprobeRecord = $allRecords | Where-Object { [string]$_.path -eq 'bin/ffprobe.exe' } | Select-Object -First 1
$licenseRecord = $allRecords | Where-Object { [string]$_.path -eq 'bin/FFMPEG-LICENSE.txt' } | Select-Object -First 1
if ($null -eq $ffmpegRecord -or -not [bool]$ffmpegRecord.required) {
    Add-Blocker 'Manifest does not require the bundled bin/ffmpeg.exe'
}
if ($null -eq $ffprobeRecord -or -not [bool]$ffprobeRecord.required) {
    Add-Blocker 'Manifest does not require the bundled bin/ffprobe.exe'
}
if ($null -eq $licenseRecord -or -not [bool]$licenseRecord.required) {
    Add-Blocker 'Manifest does not require local FFmpeg/FFprobe license evidence'
}

foreach ($file in $allRecords) {
    $logicalPath = ConvertTo-ManifestPath ([string]$file.path)
    if ($seenPaths.ContainsKey($logicalPath)) {
        Add-Blocker "Duplicate manifest target path: $logicalPath"
    } else {
        $seenPaths[$logicalPath] = $true
    }

    $actualPath = Get-ActualPath $file
    $recordResult = [ordered]@{
        path = $logicalPath
        required = [bool]$file.required
        expectedStatus = [string]$file.status
        actualStatus = 'missing'
        sizeBytes = 0
        sha256 = $null
    }

    if ($null -eq $actualPath -or -not (Test-Path -LiteralPath $actualPath -PathType Leaf)) {
        if ([bool]$file.required) {
            $reason = if ([string]$file.reason) { [string]$file.reason } else { "Required resource not found: $logicalPath" }
            Add-Blocker $reason
        }
        $checked.Add([pscustomobject]$recordResult)
        continue
    }

    try {
        $actualFile = Get-Item -LiteralPath $actualPath -Force -ErrorAction Stop
        $actualHash = Get-Sha256Hex $actualPath
        $actualSize = Get-EffectiveFileLength $actualFile
        $recordResult.actualStatus = 'present'
        $recordResult.sizeBytes = $actualSize
        $recordResult.sha256 = $actualHash
        if ([string]$file.status -ne 'present') {
            Add-Blocker "Manifest marks $logicalPath as $($file.status) but the file exists; regenerate the manifest"
        }
        if ([int64]$file.sizeBytes -ne $actualSize) {
            Add-Blocker "Size mismatch for ${logicalPath}: expected $($file.sizeBytes), actual $actualSize"
        }
        if ([string]$file.sha256 -ne $actualHash) {
            Add-Blocker "SHA-256 mismatch for $logicalPath"
        }
    } catch {
        $recordResult.actualStatus = 'error'
        if ([bool]$file.required) {
            Add-Blocker "Unable to verify ${logicalPath}: $($_.Exception.Message)"
        }
    }
    $checked.Add([pscustomobject]$recordResult)
}

if ($RequireArtifacts) {
    if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
        Add-Blocker '-RequireArtifacts requires -ArtifactRoot'
    } elseif ([string]$manifest.artifacts.status -ne 'ready') {
        Add-Blocker "Artifact inventory is not ready: $($manifest.artifacts.status)"
    } else {
        $resolvedArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot)
        foreach ($artifact in @($manifest.artifacts.files)) {
            $artifactPath = Join-Path $resolvedArtifactRoot ([string]$artifact.path -replace '/', '\')
            if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
                Add-Blocker "Required artifact not found: $($artifact.path)"
                continue
            }
            try {
                $artifactFile = Get-Item -LiteralPath $artifactPath -Force -ErrorAction Stop
                $artifactHash = Get-Sha256Hex $artifactPath
                if ([int64]$artifact.sizeBytes -ne [int64]$artifactFile.Length) {
                    Add-Blocker "Artifact size mismatch: $($artifact.path)"
                }
                if ([string]$artifact.sha256 -ne $artifactHash) {
                    Add-Blocker "Artifact SHA-256 mismatch: $($artifact.path)"
                }
            } catch {
                Add-Blocker "Unable to verify artifact $($artifact.path): $($_.Exception.Message)"
            }
        }
    }
}

$uniqueBlockers = @($blockers | Sort-Object -Unique)
$status = if ($uniqueBlockers.Count -eq 0) { 'PASS' } else { 'BLOCKED' }
$summary = [ordered]@{
    status = $status
    mode = $Mode
    manifest = $ManifestPath
    resourceRoot = $ResourceRoot
    checkedFiles = $checked.Count
    presentFiles = @($checked | Where-Object { $_.actualStatus -eq 'present' }).Count
    blockers = $uniqueBlockers
    requiredTools = [ordered]@{
        ffmpeg = if ($null -ne $ffmpegRecord) { $checked | Where-Object { $_.path -eq 'bin/ffmpeg.exe' } | Select-Object -First 1 } else { $null }
        ffprobe = if ($null -ne $ffprobeRecord) { $checked | Where-Object { $_.path -eq 'bin/ffprobe.exe' } | Select-Object -First 1 } else { $null }
        licenseEvidence = if ($null -ne $licenseRecord) { $checked | Where-Object { $_.path -eq 'bin/FFMPEG-LICENSE.txt' } | Select-Object -First 1 } else { $null }
    }
}
$summary | ConvertTo-Json -Depth 10

if ($status -ne 'PASS') {
    Write-Error "PULSARIA RUNTIME RESOURCE GATE: BLOCKED ($($uniqueBlockers.Count) blocker(s)); PATH tools are not accepted as a substitute"
    exit 1
}
Write-Host "PULSARIA RUNTIME RESOURCE GATE: PASS ($($checked.Count) files verified)"
