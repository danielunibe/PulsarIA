[CmdletBinding()]
param(
    [switch]$ConfirmReset,
    [switch]$SkipFrontendCache
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$database = Join-Path $projectRoot 'data\library.db'
$pythonScript = Join-Path $PSScriptRoot 'reset-tester.py'
$backupRoot = Join-Path $projectRoot 'data\backups'

if (-not (Test-Path -LiteralPath $database -PathType Leaf)) {
    throw "No existe la base tester: $database"
}

$backupDir = Join-Path $backupRoot ("tester-reset-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$arguments = @($pythonScript, '--database', $database, '--backup-dir', $backupDir)
if ($ConfirmReset) { $arguments += '--confirm' }
& python @arguments
if ($LASTEXITCODE -ne 0) { throw "El reset tester no terminó correctamente (exit $LASTEXITCODE)." }

if ($ConfirmReset -and -not $SkipFrontendCache) {
    $frontendCache = Join-Path $projectRoot '.next-dev'
    if (Test-Path -LiteralPath $frontendCache -PathType Container) {
        Remove-Item -LiteralPath $frontendCache -Recurse -Force
        Write-Host "Cache frontend tester eliminada: $frontendCache"
    }
}
