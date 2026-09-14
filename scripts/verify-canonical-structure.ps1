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
Set-Location -LiteralPath $ProjectRoot

$blockers = New-Object 'System.Collections.Generic.List[string]'
function Add-Blocker([string]$Message) {
    if (-not [string]::IsNullOrWhiteSpace($Message)) { $blockers.Add($Message) }
}

$requiredFiles = @('PROJECT_TRUTH.md', 'README.md', 'src-tauri/tauri.conf.json', 'python-workers/main.py')
foreach ($relative in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $relative) -PathType Leaf)) {
        Add-Blocker "Missing canonical file: $relative"
    }
}

$forbiddenRoots = @(
    'assets/models',
    'src-tauri/assets/models',
    'src-tauri/resources/models'
)
foreach ($relative in $forbiddenRoots) {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot $relative)) {
        Add-Blocker "Forbidden duplicate functional root exists: $relative"
    }
}

$workerCopies = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'src-tauri/resources/python-workers') -Filter '*.py' -File -ErrorAction SilentlyContinue)
if ($workerCopies.Count -gt 0) {
    Add-Blocker 'Duplicated Python worker sources exist under src-tauri/resources/python-workers'
}

$trackedResources = @(git ls-files -- 'src-tauri/resources/**')
foreach ($path in $trackedResources) {
    $allowed = $path -in @(
        'src-tauri/resources/bin/FFMPEG-LICENSE.txt',
        'src-tauri/resources/local-llm-manifest.json',
        'src-tauri/resources/runtime-manifest.json'
    )
    if (-not $allowed) {
        Add-Blocker "Generated runtime content is tracked; prepare it externally: $path"
    }
}

$trackedGenerated = @(git ls-files -- 'data/**' 'target/**' 'target-tauri/**' 'src-tauri/target/**' '**/*.log' '**/*.db')
if ($trackedGenerated.Count -gt 0) {
    Add-Blocker "Generated data/build artifacts are tracked: $($trackedGenerated -join ', ')"
}

$sourceFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'src-tauri/src') -Recurse -File -Filter '*.rs' -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'python-workers') -Recurse -File -Filter '*.py' -ErrorAction SilentlyContinue
)
$forbiddenSourcePatterns = @(
    'src-tauri[/\\]assets[/\\]models',
    'src-tauri[/\\]resources[/\\]models',
    'resources[/\\]models',
    'shutil\.which\s*\('
)
foreach ($file in $sourceFiles) {
    foreach ($pattern in $forbiddenSourcePatterns) {
        if (Select-String -LiteralPath $file.FullName -Pattern $pattern -Quiet) {
            Add-Blocker "Non-canonical resource resolution in $($file.FullName): $pattern"
        }
    }
}

$readme = Get-Content -LiteralPath (Join-Path $ProjectRoot 'README.md') -Raw -ErrorAction SilentlyContinue
if ($readme -notmatch 'PROJECT_TRUTH\.md') {
    Add-Blocker 'README.md must link to PROJECT_TRUTH.md as the technical authority'
}
$archiveIndex = Join-Path $ProjectRoot 'docs/archive/README.md'
if (-not (Test-Path -LiteralPath $archiveIndex -PathType Leaf)) {
    Add-Blocker 'Historical documentation index is missing: docs/archive/README.md'
}

# Historical reports may mention old branches and paths. Active documentation
# must not advertise an archived branch as the current development authority.
$activeDocumentation = @(
    Get-Item -LiteralPath (Join-Path $ProjectRoot 'README.md') -ErrorAction SilentlyContinue
    Get-Item -LiteralPath (Join-Path $ProjectRoot 'PROJECT_TRUTH.md') -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'docs') -Filter '*.md' -File -ErrorAction SilentlyContinue
)
foreach ($file in $activeDocumentation) {
    $contents = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($contents -match '(?im)^\s*(?:active\s+branch|rama\s+activa|fuente\s+vigente)\s*[:=]\s*`?(?:master|feat/frontend-integration|chestnut-dugout|codex/)') {
        Add-Blocker "Active documentation names an archived branch as authority: $($file.FullName)"
    }
}

# Canonical source directories must remain present and non-empty. This catches
# a future merge that leaves only a generated bundle while the source was
# accidentally moved to an alternate copy.
foreach ($relative in @('app', 'components', 'hooks', 'lib', 'types', 'semantic', 'sdk/typescript', 'src-tauri/src', 'python-workers')) {
    $directory = Join-Path $ProjectRoot $relative
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        Add-Blocker "Canonical source directory is missing: $relative"
    }
}

$status = if ($blockers.Count -eq 0) { 'PASS' } else { 'FAIL' }
[ordered]@{
    status = $status
    canonicalSource = 'app, components, hooks, lib, types, src-tauri/src, python-workers, semantic, sdk/typescript'
    runtimeContract = 'PULSAR_RUNTIME_ROOT -> src-tauri/resources (dev) or <executable>/resources (installed)'
    trackedRuntimeFiles = $trackedResources.Count
    duplicateWorkerCopies = $workerCopies.Count
    blockers = @($blockers)
} | ConvertTo-Json -Depth 6

if ($status -ne 'PASS') {
    Write-Error "PULSARIA CANONICAL STRUCTURE: FAIL ($($blockers.Count) blocker(s))"
    exit 1
}
Write-Host 'PULSARIA CANONICAL STRUCTURE: PASS'
