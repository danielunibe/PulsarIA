$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $requiredFiles = @(
        'components/ErrorBoundary.tsx',
        'components/VideoGrid.tsx',
        'components/ExpandedVideoModal.tsx',
        'components/SettingsPanel.tsx',
        'app/page.tsx'
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "Missing frontend accessibility contract file: $file"
        }
    }

    $boundary = Get-Content -LiteralPath 'components/ErrorBoundary.tsx' -Raw
    if ($boundary -notmatch 'role="alert"' -or $boundary -notmatch 'reloadApp') {
        throw 'Error boundary must expose an alert and an application reload action'
    }
    $modal = Get-Content -LiteralPath 'components/ExpandedVideoModal.tsx' -Raw
    if ($modal -notmatch 'role="dialog"' -or $modal -notmatch 'aria-modal="true"') {
        throw 'Video modal is missing its dialog accessibility contract'
    }
    $videoGrid = Get-Content -LiteralPath 'components/VideoGrid.tsx' -Raw
    if ($videoGrid -notmatch 'aria-label=') {
        throw 'Video grid cards must expose an accessible label'
    }
    $focusFiles = @(rg -l 'focus-visible:' app components hooks lib 2>$null)
    if ($focusFiles.Count -eq 0) {
        throw 'No visible focus contract found in the frontend'
    }
    $imgMatches = @(rg -n '<img\s' app components hooks lib 2>$null)
    foreach ($match in $imgMatches) {
        if ($match -notmatch '^([^:]+):(\d+):') {
            throw "Could not parse image lint result: $match"
        }
        $file = $Matches[1]
        $lineNumber = [int]$Matches[2]
        $lines = Get-Content -LiteralPath $file
        $start = [Math]::Max(0, $lineNumber - 3)
        $context = ($lines[$start..($lineNumber - 1)] -join "`n")
        if ($context -notmatch 'eslint-disable-next-line @next/next/no-img-element') {
            throw "Raw img element lacks an explicit reviewed exception: ${file}:$lineNumber"
        }
    }

    Write-Host 'FRONTEND ACCESSIBILITY CONTRACT: PASS'
}
finally {
    Pop-Location
}
