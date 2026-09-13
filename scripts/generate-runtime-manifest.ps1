[CmdletBinding()]
param(
    [string]$ProjectRoot,
    [string]$ResourceRoot,
    [string]$OutputPath,
    [string]$ArtifactRoot,
    [string]$BuildRoot
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
} else {
    $ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}

if ([string]::IsNullOrWhiteSpace($ResourceRoot)) {
    $ResourceRoot = Join-Path $ProjectRoot 'src-tauri/resources'
} else {
    $ResourceRoot = [System.IO.Path]::GetFullPath($ResourceRoot)
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $ResourceRoot 'runtime-manifest.json'
} else {
    $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
}

$configPath = Join-Path $ProjectRoot 'src-tauri/tauri.conf.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Tauri configuration not found: $configPath"
}
if (-not (Test-Path -LiteralPath $ResourceRoot -PathType Container)) {
    throw "Resource root not found: $ResourceRoot"
}

$tauriConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$productName = [string]$tauriConfig.productName
$productVersion = [string]$tauriConfig.version

function ConvertTo-ManifestPath {
    param([string]$Path)

    return ($Path -replace '\\', '/')
}

function Get-ProjectRelativePath {
    param([string]$AbsolutePath)

    $fullPath = [System.IO.Path]::GetFullPath($AbsolutePath)
    $rootWithSeparator = $ProjectRoot.TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        return ConvertTo-ManifestPath $fullPath
    }
    return ConvertTo-ManifestPath $fullPath.Substring($rootWithSeparator.Length)
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

function New-MissingRecord {
    param(
        [string]$TargetPath,
        [string]$SourcePath,
        [bool]$Required,
        [string]$Reason
    )

    return [ordered]@{
        path = ConvertTo-ManifestPath $TargetPath
        sourcePath = ConvertTo-ManifestPath $SourcePath
        required = $Required
        status = 'missing'
        sizeBytes = 0
        sha256 = $null
        reason = $Reason
    }
}

function New-FileRecord {
    param(
        [string]$AbsolutePath,
        [string]$TargetPath,
        [string]$SourcePath,
        [bool]$Required = $true
    )

    $target = ConvertTo-ManifestPath $TargetPath
    $source = ConvertTo-ManifestPath $SourcePath
    if (-not (Test-Path -LiteralPath $AbsolutePath -PathType Leaf)) {
        return New-MissingRecord -TargetPath $target -SourcePath $source -Required $Required -Reason "File not found: $source"
    }

    try {
        $file = Get-Item -LiteralPath $AbsolutePath -Force -ErrorAction Stop
        $hash = (Get-FileHash -LiteralPath $AbsolutePath -Algorithm SHA256 -ErrorAction Stop).Hash.ToUpperInvariant()
        return [ordered]@{
            path = $target
            sourcePath = $source
            required = $Required
            status = 'present'
            sizeBytes = Get-EffectiveFileLength $file
            sha256 = $hash
        }
    } catch {
        return [ordered]@{
            path = $target
            sourcePath = $source
            required = $Required
            status = 'error'
            sizeBytes = 0
            sha256 = $null
            reason = $_.Exception.Message
        }
    }
}

function Get-ComponentStatus {
    param([object[]]$Files)

    $invalid = @($Files | Where-Object { $_.required -and $_.status -ne 'present' })
    if ($invalid.Count -gt 0) {
        return 'blocked'
    }
    return 'ready'
}

function Get-ExecutableVersion {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
        if (-not [string]::IsNullOrWhiteSpace($versionInfo.ProductVersion)) {
            return [string]$versionInfo.ProductVersion
        }
        if (-not [string]::IsNullOrWhiteSpace($versionInfo.FileVersion)) {
            return [string]$versionInfo.FileVersion
        }
    } catch { }
    return $null
}

function Get-CommandVersionLine {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        $line = & $Path '-version' 2>$null | Select-Object -First 1
        if ($null -ne $line -and -not [string]::IsNullOrWhiteSpace([string]$line)) {
            return ([string]$line).Trim()
        }
    } catch { }
    return Get-ExecutableVersion $Path
}

function Get-PackageMetadata {
    param(
        [string]$SitePackages,
        [string]$DisplayName,
        [string]$DirectoryPattern
    )

    $packageDirectory = Get-ChildItem -LiteralPath $SitePackages -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like $DirectoryPattern } |
        Sort-Object Name |
        Select-Object -First 1
    if ($null -eq $packageDirectory) {
        return [ordered]@{
            name = $DisplayName
            version = $null
            status = 'missing'
            metadataPath = $null
        }
    }

    $metadataPath = Join-Path $packageDirectory.FullName 'METADATA'
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
        return [ordered]@{
            name = $DisplayName
            version = $null
            status = 'missing'
            metadataPath = Get-ProjectRelativePath $metadataPath
        }
    }

    $versionLine = Select-String -LiteralPath $metadataPath -Pattern '^Version:\s*(.+)$' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $version = if ($null -ne $versionLine) { ([string]$versionLine.Matches[0].Groups[1].Value).Trim() } else { $null }
    return [ordered]@{
        name = $DisplayName
        version = $version
        status = if ([string]::IsNullOrWhiteSpace($version)) { 'missing' } else { 'present' }
        metadataPath = Get-ProjectRelativePath $metadataPath
    }
}

function Get-ModelFiles {
    param(
        [string]$AbsoluteRoot,
        [string]$TargetPrefix,
        [string]$SourcePrefix
    )

    if (-not (Test-Path -LiteralPath $AbsoluteRoot -PathType Container)) {
        return @(
            New-MissingRecord -TargetPath "$TargetPrefix/model-files" -SourcePath "$SourcePrefix/model-files" -Required $true -Reason "Model directory not found: $SourcePrefix"
        )
    }

    $root = [System.IO.Path]::GetFullPath($AbsoluteRoot).TrimEnd('\') + '\'
    $files = Get-ChildItem -LiteralPath $AbsoluteRoot -File -Recurse -Force -ErrorAction SilentlyContinue |
        Sort-Object FullName
    return @($files | ForEach-Object {
        $relative = ConvertTo-ManifestPath $_.FullName.Substring($root.Length)
        New-FileRecord -AbsolutePath $_.FullName -TargetPath "$TargetPrefix/$relative" -SourcePath "$SourcePrefix/$relative"
    })
}

$blockers = New-Object 'System.Collections.Generic.List[string]'

$pythonRoot = Join-Path $ResourceRoot 'python'
$sitePackages = Join-Path $pythonRoot 'Lib/site-packages'
$pythonDefinitions = @(
    @{ source = 'python/python.exe'; target = 'python/python.exe' },
    @{ source = 'python/python311.dll'; target = 'python/python311.dll' },
    @{ source = 'python/python311.zip'; target = 'python/python311.zip' },
    @{ source = 'python/Lib/site-packages/ctranslate2/ctranslate2.dll'; target = 'python/Lib/site-packages/ctranslate2/ctranslate2.dll' },
    @{ source = 'python/Lib/site-packages/ctranslate2/_ext.cp311-win_amd64.pyd'; target = 'python/Lib/site-packages/ctranslate2/_ext.cp311-win_amd64.pyd' },
    @{ source = 'python/Lib/site-packages/faster_whisper/transcribe.py'; target = 'python/Lib/site-packages/faster_whisper/transcribe.py' },
    @{ source = 'python/Lib/site-packages/faster_whisper/version.py'; target = 'python/Lib/site-packages/faster_whisper/version.py' },
    @{ source = 'python/Lib/site-packages/onnxruntime/capi/onnxruntime.dll'; target = 'python/Lib/site-packages/onnxruntime/capi/onnxruntime.dll' },
    @{ source = 'python/Lib/site-packages/onnxruntime/capi/onnxruntime_pybind11_state.pyd'; target = 'python/Lib/site-packages/onnxruntime/capi/onnxruntime_pybind11_state.pyd' },
    @{ source = 'python/Lib/site-packages/PIL/_imaging.cp311-win_amd64.pyd'; target = 'python/Lib/site-packages/PIL/_imaging.cp311-win_amd64.pyd' },
    @{ source = 'python/Lib/site-packages/tokenizers/tokenizers.pyd'; target = 'python/Lib/site-packages/tokenizers/tokenizers.pyd' },
    @{ source = 'python/Lib/site-packages/yt_dlp/YoutubeDL.py'; target = 'python/Lib/site-packages/yt_dlp/YoutubeDL.py' }
)
$pythonFiles = @($pythonDefinitions | ForEach-Object {
    $absolute = Join-Path $ResourceRoot $_.source
    New-FileRecord -AbsolutePath $absolute -TargetPath $_.target -SourcePath "src-tauri/resources/$($_.source)"
})

$packageSpecs = @(
    @{ name = 'faster-whisper'; pattern = 'faster_whisper-*.dist-info' },
    @{ name = 'ctranslate2'; pattern = 'ctranslate2-*.dist-info' },
    @{ name = 'onnxruntime'; pattern = 'onnxruntime-*.dist-info' },
    @{ name = 'Pillow'; pattern = 'pillow-*.dist-info' },
    @{ name = 'tokenizers'; pattern = 'tokenizers-*.dist-info' },
    @{ name = 'yt-dlp'; pattern = 'yt_dlp-*.dist-info' },
    @{ name = 'ffmpeg-python'; pattern = 'ffmpeg_python-*.dist-info' }
)
$pythonPackages = @($packageSpecs | ForEach-Object {
    $package = Get-PackageMetadata -SitePackages $sitePackages -DisplayName $_.name -DirectoryPattern $_.pattern
    if ($package.status -ne 'present') {
        $blockers.Add("Critical embedded Python package metadata is missing: $($_.name)")
    } elseif (-not [string]::IsNullOrWhiteSpace([string]$package.metadataPath)) {
        $metadataAbsolute = Join-Path $ProjectRoot $package.metadataPath
        $metadataTarget = $package.metadataPath.Substring('src-tauri/resources/'.Length)
        $pythonFiles += New-FileRecord -AbsolutePath $metadataAbsolute -TargetPath $metadataTarget -SourcePath $package.metadataPath
    }
    $package
})
$pythonStatus = Get-ComponentStatus $pythonFiles

$workerMappings = @($tauriConfig.bundle.resources.PSObject.Properties |
    Where-Object { [string]$_.Name -like '../python-workers/*.py' } |
    Sort-Object Name)
$workerFiles = @($workerMappings | ForEach-Object {
    $sourceFromTauri = ConvertTo-ManifestPath ([string]$_.Name)
    $sourceRelative = $sourceFromTauri.Substring('../'.Length)
    $sourceAbsolute = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $ProjectRoot 'src-tauri') ($sourceFromTauri -replace '/', '\')))
    $targetPath = ConvertTo-ManifestPath ([string]$_.Value)
    if ($targetPath.StartsWith('resources/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $targetPath = $targetPath.Substring('resources/'.Length)
    }
    New-FileRecord -AbsolutePath $sourceAbsolute -TargetPath $targetPath -SourcePath $sourceRelative
})
if ($workerMappings.Count -eq 0) {
    $blockers.Add('No canonical Python worker mappings were found in tauri.conf.json')
}
$duplicateWorkers = @(Get-ChildItem -LiteralPath (Join-Path $ResourceRoot 'python-workers') -Filter '*.py' -File -ErrorAction SilentlyContinue)
if ($duplicateWorkers.Count -gt 0) {
    $blockers.Add('Duplicated Python worker sources exist under src-tauri/resources/python-workers; the bundle must have one source of truth')
}
$workerStatus = Get-ComponentStatus $workerFiles

$onnxRoot = Join-Path $ResourceRoot 'assets/models/all-MiniLM-L6-v2'
$onnxFiles = Get-ModelFiles -AbsoluteRoot $onnxRoot -TargetPrefix 'assets/models/all-MiniLM-L6-v2' -SourcePrefix 'src-tauri/resources/assets/models/all-MiniLM-L6-v2'
$onnxStatus = Get-ComponentStatus $onnxFiles
$onnxModelFile = $onnxFiles | Where-Object { $_.path -eq 'assets/models/all-MiniLM-L6-v2/model.onnx' } | Select-Object -First 1

$whisperRoot = Join-Path $ResourceRoot 'assets/models/models--Systran--faster-whisper-tiny'
$whisperFiles = Get-ModelFiles -AbsoluteRoot $whisperRoot -TargetPrefix 'assets/models/models--Systran--faster-whisper-tiny' -SourcePrefix 'src-tauri/resources/assets/models/models--Systran--faster-whisper-tiny'
$whisperStatus = Get-ComponentStatus $whisperFiles
$whisperSnapshot = Get-ChildItem -LiteralPath (Join-Path $whisperRoot 'snapshots') -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
$whisperVersion = if ($null -ne $whisperSnapshot) { $whisperSnapshot.Name } else { $null }

$ffmpegPath = Join-Path $ResourceRoot 'bin/ffmpeg.exe'
$ffprobePath = Join-Path $ResourceRoot 'bin/ffprobe.exe'
$ffmpegLicensePath = Join-Path $ResourceRoot 'bin/FFMPEG-LICENSE.txt'
$ffmpegFile = New-FileRecord -AbsolutePath $ffmpegPath -TargetPath 'bin/ffmpeg.exe' -SourcePath 'src-tauri/resources/bin/ffmpeg.exe'
$ffprobeFile = New-FileRecord -AbsolutePath $ffprobePath -TargetPath 'bin/ffprobe.exe' -SourcePath 'src-tauri/resources/bin/ffprobe.exe'
$ffmpegLicenseFile = New-FileRecord -AbsolutePath $ffmpegLicensePath -TargetPath 'bin/FFMPEG-LICENSE.txt' -SourcePath 'src-tauri/resources/bin/FFMPEG-LICENSE.txt'
$mediaFiles = @($ffmpegFile, $ffprobeFile, $ffmpegLicenseFile)
$mediaStatus = Get-ComponentStatus $mediaFiles

$allRequiredFiles = @($pythonFiles + $workerFiles + $onnxFiles + $whisperFiles + $mediaFiles)
foreach ($file in $allRequiredFiles) {
    if ($file.required -and $file.status -ne 'present') {
        $reason = if ([string]::IsNullOrWhiteSpace([string]$file.reason)) { "Resource is $($file.status): $($file.path)" } else { [string]$file.reason }
        $blockers.Add($reason)
    }
}

$artifactInventory = [ordered]@{
    status = 'not-collected'
    root = $null
    files = @()
    note = 'Pass -ArtifactRoot and optionally -BuildRoot after a build to record executable and installer hashes.'
}
if (-not [string]::IsNullOrWhiteSpace($ArtifactRoot)) {
    $resolvedArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot)
    $artifactInventory.root = Get-ProjectRelativePath $resolvedArtifactRoot
    $artifactFiles = New-Object 'System.Collections.Generic.List[object]'

    $nsis = Get-ChildItem -LiteralPath (Join-Path $resolvedArtifactRoot 'nsis') -Filter '*_x64-setup.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object Name | Select-Object -First 1
    $msi = Get-ChildItem -LiteralPath (Join-Path $resolvedArtifactRoot 'msi') -Filter '*_x64*.msi' -File -ErrorAction SilentlyContinue |
        Sort-Object Name | Select-Object -First 1
    if ($null -eq $nsis) {
        $artifactFiles.Add((New-MissingRecord -TargetPath 'nsis/<x64-setup.exe>' -SourcePath "$artifactInventory.root/nsis/<x64-setup.exe>" -Required $true -Reason 'NSIS x64 installer was not found'))
    } else {
        $artifactFiles.Add((New-FileRecord -AbsolutePath $nsis.FullName -TargetPath "nsis/$($nsis.Name)" -SourcePath (Get-ProjectRelativePath $nsis.FullName)))
    }
    if ($null -eq $msi) {
        $artifactFiles.Add((New-MissingRecord -TargetPath 'msi/<x64.msi>' -SourcePath "$artifactInventory.root/msi/<x64.msi>" -Required $true -Reason 'MSI x64 installer was not found'))
    } else {
        $artifactFiles.Add((New-FileRecord -AbsolutePath $msi.FullName -TargetPath "msi/$($msi.Name)" -SourcePath (Get-ProjectRelativePath $msi.FullName)))
    }

    $latestJson = Get-ChildItem -LiteralPath $resolvedArtifactRoot -Filter 'latest.json' -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName | Select-Object -First 1
    if ($null -eq $latestJson) {
        $artifactFiles.Add((New-MissingRecord -TargetPath 'latest.json' -SourcePath "$artifactInventory.root/latest.json" -Required $true -Reason 'latest.json was not found'))
    } else {
        $artifactFiles.Add((New-FileRecord -AbsolutePath $latestJson.FullName -TargetPath 'latest.json' -SourcePath (Get-ProjectRelativePath $latestJson.FullName)))
    }
    $sigFiles = @(Get-ChildItem -LiteralPath $resolvedArtifactRoot -Filter '*.sig' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName)
    if ($sigFiles.Count -eq 0) {
        $artifactFiles.Add((New-MissingRecord -TargetPath '<artifact>.sig' -SourcePath "$artifactInventory.root/<artifact>.sig" -Required $true -Reason 'No updater signature (*.sig) artifact was found'))
    } else {
        foreach ($sigFile in $sigFiles) {
            $artifactFiles.Add((New-FileRecord -AbsolutePath $sigFile.FullName -TargetPath (Get-ProjectRelativePath $sigFile.FullName).Substring((Get-ProjectRelativePath $resolvedArtifactRoot).Length).TrimStart('/') -SourcePath (Get-ProjectRelativePath $sigFile.FullName)))
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($BuildRoot)) {
        $resolvedBuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
        $executable = Join-Path $resolvedBuildRoot 'pulsaria.exe'
        if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
            $artifactFiles.Add((New-MissingRecord -TargetPath 'pulsaria.exe' -SourcePath (Get-ProjectRelativePath $executable) -Required $true -Reason 'Tauri executable was not found'))
        } else {
            $artifactFiles.Add((New-FileRecord -AbsolutePath $executable -TargetPath 'pulsaria.exe' -SourcePath (Get-ProjectRelativePath $executable)))
        }
    }
    $artifactInventory.files = @($artifactFiles)
    $artifactInventory.status = Get-ComponentStatus $artifactInventory.files
    foreach ($artifactFile in $artifactInventory.files) {
        if ($artifactFile.required -and $artifactFile.status -ne 'present') {
            $blockers.Add([string]$artifactFile.reason)
        }
    }
}

$components = @(
    [ordered]@{
        id = 'python-runtime'
        required = $true
        status = $pythonStatus
        version = Get-ExecutableVersion $pythonRoot\python.exe
        versionSource = 'python.exe file version'
        criticalPackages = $pythonPackages
        files = $pythonFiles
    },
    [ordered]@{
        id = 'python-workers'
        required = $true
        status = $workerStatus
        version = 'bundled-source'
        versionSource = 'tauri.conf.json resource mappings'
        files = $workerFiles
    },
    [ordered]@{
        id = 'onnx-minilm'
        required = $true
        status = $onnxStatus
        version = if ($null -ne $onnxModelFile -and $onnxModelFile.status -eq 'present') { "sha256:$($onnxModelFile.sha256)" } else { $null }
        versionSource = 'model.onnx content hash'
        files = $onnxFiles
    },
    [ordered]@{
        id = 'whisper-tiny'
        required = $true
        status = $whisperStatus
        version = $whisperVersion
        versionSource = 'Hugging Face snapshot directory name'
        files = $whisperFiles
    },
    [ordered]@{
        id = 'media-tools'
        required = $true
        status = $mediaStatus
        version = [ordered]@{
            ffmpeg = Get-CommandVersionLine $ffmpegPath
            ffprobe = Get-CommandVersionLine $ffprobePath
        }
        versionSource = 'bundled executable -version output'
        files = $mediaFiles
        policy = 'ffmpeg, ffprobe and the local license evidence must be present under resources/bin; PATH executables are never accepted'
    }
)

$uniqueBlockers = @($blockers | Sort-Object -Unique)
$contractStatus = if ($uniqueBlockers.Count -eq 0) { 'PASS' } else { 'BLOCKED' }
$manifest = [ordered]@{
    schemaVersion = 1
    manifestKind = 'pulsaria-runtime-resources'
    productName = $productName
    version = $productVersion
    platform = 'windows-x86_64'
    resourceRoot = 'resources'
    generatedBy = 'scripts/generate-runtime-manifest.ps1'
    reproducibility = [ordered]@{
        timestampsExcluded = $true
        hashes = 'SHA-256 uppercase'
        sourceOfTruth = 'PULSAR_RUNTIME_ROOT plus canonical python-workers source mappings'
    }
    contract = [ordered]@{
        status = $contractStatus
        blockers = $uniqueBlockers
        policy = 'A missing required resource is a release blocker. System PATH tools and downloaded binaries are not accepted.'
    }
    components = $components
    artifacts = $artifactInventory
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
$json = $manifest | ConvertTo-Json -Depth 30
[System.IO.File]::WriteAllText($OutputPath, "$json`r`n", [System.Text.UTF8Encoding]::new($false))

$summary = [ordered]@{
    status = $contractStatus
    output = $OutputPath
    version = $productVersion
    checkedFiles = $allRequiredFiles.Count
    presentFiles = @($allRequiredFiles | Where-Object { $_.status -eq 'present' }).Count
    blockers = $uniqueBlockers
    artifactInventory = $artifactInventory.status
}
$summary | ConvertTo-Json -Depth 6
if ($contractStatus -ne 'PASS') {
    Write-Error "PULSARIA RUNTIME MANIFEST: BLOCKED ($($uniqueBlockers.Count) blocker(s)); manifest written to $OutputPath"
    exit 1
}
Write-Host "PULSARIA RUNTIME MANIFEST: PASS ($OutputPath)"
