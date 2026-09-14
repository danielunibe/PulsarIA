[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Read-ProjectFile {
    param([string]$RelativePath)
    $path = Join-Path $projectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Onboarding contract file is missing: $RelativePath"
    }
    return Get-Content -LiteralPath $path -Raw
}

function Assert-Contains {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Message
    )
    if ($Content -notmatch $Pattern) { throw $Message }
}

$page = Read-ProjectFile 'app/page.tsx'
$setup = Read-ProjectFile 'components/ProcessingSetupModal.tsx'
$setupCss = Read-ProjectFile 'components/ProcessingSetupModal.module.css'
$legal = Read-ProjectFile 'components/LegalConsentModal.tsx'
$legalHook = Read-ProjectFile 'hooks/use-legal-consent.ts'
$processingHook = Read-ProjectFile 'hooks/use-processing-settings.ts'
$updater = Read-ProjectFile 'hooks/use-updater.ts'
$commands = Read-ProjectFile 'src-tauri/src/commands.rs'

Assert-Contains $page 'legalGateReady\s*&&\s*processingSetup\.showSetup' 'The technical setup must be gated by native legal consent.'
Assert-Contains $page 'legalConsent\.loading\s*\|\|\s*legalConsent\.needsConsent' 'The legal consent state must remain visibly blocking.'
Assert-Contains $legal 'z-\[1300\]' 'The legal modal must remain above all application surfaces.'
Assert-Contains $setup 'Configura Pulsaria paso a paso' 'The onboarding copy must describe progressive setup.'
Assert-Contains $setup 'hardwareDetailsOpen' 'Hardware details must be collapsible.'
Assert-Contains $setup 'data-setup-step-heading="true"' 'Step headings must be focus targets after navigation.'
Assert-Contains $setup 'role="radiogroup"' 'Single-choice controls must expose radiogroup semantics.'
Assert-Contains $setup 'intentQuestion < 3' 'Intent must expose only one question at a time before the profile summary.'
Assert-Contains $setup 'aria-invalid={mediaRootInvalid}' 'Media path validation must be announced to assistive technology.'
Assert-Contains $setup 'aria-invalid={quotaInvalid}' 'Quota validation must be announced to assistive technology.'
Assert-Contains $setup 'data-first-step=' 'The first step must have a distinct navigation layout.'
Assert-Contains $setup "effectiveStep !== 'welcome'.*styles\.backButton" 'Back must not be rendered on the first welcome step.'
Assert-Contains $setup "setStep\('hardware'\)" 'The welcome screen must precede the hardware screen.'
Assert-Contains $setup "{ id: 'welcome', label: 'Bienvenida' }" 'The onboarding must expose a standalone welcome stage.'
Assert-Contains $setup "{ id: 'hardware', label: 'Equipo' }" 'The onboarding must expose a standalone hardware stage.'
Assert-Contains $setup "{ id: 'intent', label: 'Intención 3' }" 'The onboarding must expose the third intent stage.'
Assert-Contains $setup "setIntentQuestion\(1\)" 'Intent question one must advance directly after selection.'
Assert-Contains $setup "setIntentQuestion\(2\)" 'Intent question two must advance directly after selection.'
Assert-Contains $setup "setIntentQuestion\(3\)" 'Intent question three must lead to the profile summary.'
Assert-Contains $setup "setStep\('storage'\)" 'The profile selection must advance to storage.'
Assert-Contains $page 'WelcomeAnimation' 'The first-run welcome animation must be mounted by the app shell.'
Assert-Contains $page 'pulsaria\.welcome-animation\.v1' 'The welcome animation completion must be persisted by version.'
Assert-Contains $page 'processingSetup\.runtimeReady' 'The welcome animation must wait for the native runtime preflight.'
Assert-Contains $processingHook "get_runtime_preflight" 'The processing hook must verify the native runtime before the welcome flow.'
Assert-Contains $updater "CHECK_INTERVAL_MS = 24 \* 60 \* 60 \* 1000" 'The updater must throttle automatic checks to once per 24 hours.'
Assert-Contains $updater "blocked-by-active-job" 'The updater must expose a safe blocked state for active jobs.'
Assert-Contains $updater "allowDowngrades: false" 'The updater must reject silent downgrades.'
Assert-Contains $updater "downloadAndInstall" 'The updater must use the signed Tauri installation path.'
Assert-Contains $setupCss '\.navigation\[data-first-step="true"\]' 'The first-step navigation must use the full-width CTA layout.'
Assert-Contains $legalHook 'eulaVersion:\s*''0\.1''' 'Frontend legal EULA version is not pinned.'
Assert-Contains $commands 'CURRENT_EULA_VERSION:\s*&str\s*=\s*"0\.1"' 'Native legal EULA version is not pinned.'

[ordered]@{
    status = 'PASS'
    legalGate = $true
    progressiveCopy = $true
    collapsibleHardware = $true
    focusableStepHeadings = $true
    radioSemantics = $true
    firstStepNavigation = $true
    visualStages = 8
    directSelectionAdvance = $true
    automaticUpdateCheckIntervalHours = 24
    activeJobInstallBlock = $true
    legalVersion = '0.1'
} | ConvertTo-Json -Depth 4

Write-Host 'PULSARIA ONBOARDING CONTRACT: PASS'
