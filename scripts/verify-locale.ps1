$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$checks = @(
    @{ Path = 'lib/settings-context.tsx'; Pattern = "export type Locale = 'es-MX' \| 'en-US'"; Label = 'Locale type' },
    @{ Path = 'lib/settings-context.tsx'; Pattern = "locale: 'es-MX'"; Label = 'Spanish default' },
    @{ Path = 'lib/settings-context.tsx'; Pattern = 'localStorage.setItem.*pulsar-settings'; Label = 'Locale persistence' },
    @{ Path = 'lib/i18n.tsx'; Pattern = 'export function I18nProvider'; Label = 'I18n provider' },
    @{ Path = 'lib/i18n.tsx'; Pattern = "translations\['es-MX'\]"; Label = 'Spanish fallback' },
    @{ Path = 'components/ProcessingSetupModal.tsx'; Pattern = 'setLocale\(value\)'; Label = 'First-launch selector' },
    @{ Path = 'components/SettingsPanel.tsx'; Pattern = 'setLocale\(value\)'; Label = 'Settings selector' }
)

foreach ($check in $checks) {
    $path = Join-Path $projectRoot $check.Path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Locale contract file missing: $($check.Path)"
    }
    if (-not (Select-String -LiteralPath $path -Pattern $check.Pattern -Quiet)) {
        throw "Locale contract missing: $($check.Label)"
    }
}

Write-Host "PULSARIA LOCALE CONTRACT: PASS (es-MX default, en-US selector and persistence wired)"
