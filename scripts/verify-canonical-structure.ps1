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
    'src-tauri/resources/models',
    'frontend',
    'src/frontend',
    'web/frontend'
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

$activeRoots = @('app', 'components', 'hooks', 'lib', 'types', 'semantic', 'sdk/typescript', 'src-tauri/src', 'python-workers')
$activeFiles = foreach ($relative in $activeRoots) {
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot $relative) -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @('.ts', '.tsx', '.js', '.jsx', '.rs', '.py') }
}
foreach ($file in $activeFiles) {
    $contents = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    $normalizedFilePath = $file.FullName.Replace('\\', '/')
    $isDemoProvider = $normalizedFilePath -eq ((Join-Path $ProjectRoot 'lib/demo-media.ts').Replace('\\', '/'))
    if ($contents -match '(?i)(mixkit|pexels\.com/video|FALLBACK_DATA|lib/mock-data)') {
        Add-Blocker "Demo or mock content referenced by active source: $($file.FullName)"
    } elseif ($contents -match '(?i)public/demo' -and -not $isDemoProvider) {
        Add-Blocker "Demo assets must be accessed only through lib/demo-media.ts: $($file.FullName)"
    }
}

$iconBoundary = Join-Path $ProjectRoot 'components/icon-library.tsx'
if (-not (Test-Path -LiteralPath $iconBoundary -PathType Leaf)) {
    Add-Blocker 'The React icon boundary is missing: components/icon-library.tsx'
}
$sourceContractFiles = @(
    'components/TikTokSourcesPanel.tsx',
    'src-tauri/src/application/collection_service.rs',
    'python-workers/source_scanner.py'
)
foreach ($relative in $sourceContractFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $relative) -PathType Leaf)) {
        Add-Blocker "Persistent TikTok source contract file is missing: $relative"
    }
}
$dbSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/src/db.rs') -Raw
foreach ($table in @('collection_sources', 'collection_source_items', 'collection_source_activity')) {
    if ($dbSource -notmatch "CREATE TABLE IF NOT EXISTS $table") {
        Add-Blocker "Canonical SQLite source table is not declared in db.rs: $table"
    }
}
$packageJson = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
if ($packageJson.dependencies.next -ne '16.3.8') {
    Add-Blocker "Canonical frontend must use Next 16.3.8; found $($packageJson.dependencies.next)"
}
$versionContract = Join-Path $ProjectRoot 'scripts/verify-version-contract.ps1'
if (Test-Path -LiteralPath $versionContract -PathType Leaf) {
    $versionOutput = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $versionContract 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Add-Blocker "Canonical version contract failed: $($versionOutput -join ' ')"
    }
} else {
    Add-Blocker 'Canonical version contract is missing: scripts/verify-version-contract.ps1'
}

$manifest = Get-Content -LiteralPath (Join-Path $ProjectRoot 'PROJECT.manifest.json') -Raw | ConvertFrom-Json
if ($manifest.entrypoints.frontend -notmatch 'app/page\.tsx.*fuente activa') {
    Add-Blocker 'PROJECT.manifest.json must identify app/page.tsx as the only active frontend entrypoint'
}
if ($manifest.canonicalPolicy.zipRole -ne 'reference-only') {
    Add-Blocker 'PROJECT.manifest.json must keep pulsaria.zip as reference-only'
}
if ($manifest.canonicalPolicy.demoRuntime -ne 'isolated-demo-only') {
    Add-Blocker 'PROJECT.manifest.json must identify demo content as isolated-demo-only'
}
if ($manifest.canonicalPolicy.demoLibraryData -ne 'forbidden') {
    Add-Blocker 'PROJECT.manifest.json must forbid demo content as library data'
}
if ($manifest.canonicalPolicy.demoAssetProvider -ne 'lib/demo-media.ts -> public/demo/pulsaria-dev/demo-slots.json') {
    Add-Blocker 'PROJECT.manifest.json must identify lib/demo-media.ts as the only demo asset provider'
}
if ($manifest.canonicalPolicy.demoStagingSource -notmatch 'imagenes pulsaria') {
    Add-Blocker 'PROJECT.manifest.json must document the external demo staging source'
}
if ($manifest.canonicalPolicy.persistentSourceModel -notmatch 'collection_sources') {
    Add-Blocker 'PROJECT.manifest.json must identify collection_sources as the persistent source authority'
}
if ($manifest.canonicalPolicy.singleIngestionQueue -ne 'QueueService') {
    Add-Blocker 'PROJECT.manifest.json must identify QueueService as the only ingestion queue'
}
if ($manifest.canonicalPolicy.developmentUrl -ne 'http://127.0.0.1:3000' -or @($manifest.canonicalPolicy.fallbackPorts).Count -ne 0) {
    Add-Blocker 'PROJECT.manifest.json must pin development to 127.0.0.1:3000 without fallback ports'
}
if ($manifest.identity.iconSource -notmatch 'icono pulsaria') {
    Add-Blocker 'PROJECT.manifest.json must document the canonical Pulsaria PNG source'
}
if ($manifest.identity.webAsset -ne 'public/pulsaria-icon.png' -or $manifest.identity.nativeAssetRoot -ne 'src-tauri/icons') {
    Add-Blocker 'PROJECT.manifest.json must document the canonical web and native icon assets'
}

$devLauncher = Get-Content -LiteralPath (Join-Path $ProjectRoot 'scripts/dev-next.ps1') -Raw
if ($devLauncher -notmatch 'http://127\.0\.0\.1:3000' -or $devLauncher -notmatch '\.next-dev') {
    Add-Blocker 'scripts/dev-next.ps1 must use the canonical URL and isolated .next-dev directory'
}
$tauriConfig = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
if ($tauriConfig.build.devUrl -ne 'http://127.0.0.1:3000') {
    Add-Blocker 'src-tauri/tauri.conf.json must point devUrl to 127.0.0.1:3000'
}
$mainWindow = @($tauriConfig.app.windows)[0]
if ($mainWindow.decorations -ne $false) {
    Add-Blocker 'The native Tauri window must disable decorations so the React window controls remain canonical'
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
