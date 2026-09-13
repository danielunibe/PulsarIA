[CmdletBinding()]
param(
    [string]$SourceRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}

$scanRoots = @('app', 'components', 'hooks', 'lib', 'out', '.next') |
    ForEach-Object { Join-Path $SourceRoot $_ }
$extensions = @('.css', '.html', '.js', '.json', '.map', '.mjs', '.ts', '.tsx')
$patterns = @(
    'NEXT_PUBLIC_[A-Z0-9_]*(API_KEY|TOKEN|SECRET)',
    'generativelanguage\.googleapis\.com',
    'AIza[0-9A-Za-z_-]{20,}'
)

$files = foreach ($root in $scanRoots) {
    if (Test-Path -LiteralPath $root -PathType Container) {
        Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue
    }
}
foreach ($file in $files) {
    if ($extensions -contains $file.Extension.ToLowerInvariant() -and $file.Length -le 32MB) {
        if (Select-String -LiteralPath $file.FullName -Pattern $patterns -Quiet -ErrorAction SilentlyContinue) {
            throw "A public cloud credential or direct cloud LLM endpoint was found in $($file.FullName)."
        }
    }
}

Write-Host 'PULSARIA FRONTEND SECRET GATE: PASS (no public cloud credential or direct cloud LLM endpoint)'
