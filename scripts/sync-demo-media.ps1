[CmdletBinding()]
param(
    [string]$SourceDir = 'C:\Users\danie\Desktop\imagenes pulsaria',
    [string]$DestinationDir = '',
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($DestinationDir)) {
    $DestinationDir = Join-Path $projectRoot 'public\demo\pulsaria-dev'
}

if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    throw "No existe la carpeta de medios DEMO: $SourceDir. Coloca allí los PNG/MP4/WebM y vuelve a ejecutar el sincronizador."
}

$destinationResolved = [System.IO.Path]::GetFullPath($DestinationDir)
$projectResolved = [System.IO.Path]::GetFullPath($projectRoot)
if (-not $destinationResolved.StartsWith($projectResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "El destino DEMO debe permanecer dentro del checkout canónico: $projectResolved"
}

New-Item -ItemType Directory -Force -Path $destinationResolved | Out-Null
$manifestPath = Join-Path $destinationResolved 'demo-slots.json'
$slotMapPath = Join-Path $destinationResolved 'demo-slot-map.json'
$imageExtensions = @('.png', '.jpg', '.jpeg')
$videoExtensions = @('.mp4', '.webm')
$allowedExtensions = $imageExtensions + $videoExtensions

$sourceFiles = @(Get-ChildItem -LiteralPath $SourceDir -File | Where-Object {
    $allowedExtensions -contains $_.Extension.ToLowerInvariant()
} | Sort-Object LastWriteTime, Name)
if ($sourceFiles.Count -eq 0) {
    throw "La carpeta DEMO no contiene PNG/JPG/JPEG/MP4/WEBM: $SourceDir"
}

$slotMap = @{}
if (Test-Path -LiteralPath $slotMapPath -PathType Leaf) {
    try {
        $rawMap = Get-Content -LiteralPath $slotMapPath -Raw | ConvertFrom-Json
        foreach ($entry in @($rawMap.slots)) {
            if ($entry.slotId -and $entry.sourceStem) {
                $slotMap[[string]$entry.slotId] = [string]$entry.sourceStem
            }
        }
    } catch {
        Write-Warning "El mapa DEMO anterior no pudo leerse; se reconstruirá sin tocar tus archivos fuente."
    }
}

if ($Clean) {
    Get-ChildItem -LiteralPath $destinationResolved -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^demo-\d{2}\.(png|jpg|jpeg|mp4|webm)$' } |
        Remove-Item -Force
}

$knownStems = @($slotMap.Values)
foreach ($file in $sourceFiles) {
    if ($knownStems -notcontains $file.BaseName -and $knownStems.Count -lt 99) {
        $nextNumber = 1
        while ($slotMap.ContainsKey(('demo-{0:D2}' -f $nextNumber))) { $nextNumber++ }
        $slotMap[('demo-{0:D2}' -f $nextNumber)] = $file.BaseName
        $knownStems += $file.BaseName
    }
}

$items = @()
$mapEntries = @()
foreach ($slotId in ($slotMap.Keys | Sort-Object)) {
    $sourceStem = $slotMap[$slotId]
    $candidates = @($sourceFiles | Where-Object { $_.BaseName -eq $sourceStem -or $_.BaseName -eq $slotId })
    if ($candidates.Count -eq 0) { continue }
    $image = $candidates | Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() } | Select-Object -First 1
    $video = $candidates | Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } | Select-Object -First 1
    $selected = if ($video) { $video } elseif ($image) { $image } else { $null }
    if (-not $selected) { continue }

    $outputName = "$slotId$($selected.Extension.ToLowerInvariant())"
    Copy-Item -LiteralPath $selected.FullName -Destination (Join-Path $destinationResolved $outputName) -Force
    $imageSrc = if ($image) { "/demo/pulsaria-dev/$slotId$($image.Extension.ToLowerInvariant())" } else { "/demo/pulsaria-dev/$outputName" }
    if ($image -and $image.FullName -ne $selected.FullName) {
        Copy-Item -LiteralPath $image.FullName -Destination (Join-Path $destinationResolved "$slotId$($image.Extension.ToLowerInvariant())") -Force
    }
    $items += [ordered]@{
        slotId = $slotId
        label = "Demo $($slotId.Substring(5))"
        imageSrc = $imageSrc
        videoSrc = if ($video) { "/demo/pulsaria-dev/$slotId$($video.Extension.ToLowerInvariant())" } else { $null }
        mediaKind = if ($video) { 'video' } else { 'image' }
        isDemo = $true
    }
    $mapEntries += [ordered]@{ slotId = $slotId; sourceStem = $sourceStem }
}

if ($items.Count -eq 0) {
    throw "No fue posible construir slots DEMO a partir de $SourceDir"
}

[ordered]@{ version = 1; source = $SourceDir; generatedAt = (Get-Date).ToUniversalTime().ToString('o'); items = @($items) } |
    ConvertTo-Json -Depth 5 | ForEach-Object { $manifestJson = $_ }
[ordered]@{ version = 1; source = $SourceDir; slots = $mapEntries } |
    ConvertTo-Json -Depth 5 | ForEach-Object { $slotMapJson = $_ }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)
[System.IO.File]::WriteAllText($slotMapPath, $slotMapJson, $utf8NoBom)

Write-Host ("DEMO sincronizado: {0} slots en {1}" -f $items.Count, $destinationResolved)
