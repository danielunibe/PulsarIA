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
$draft = Read-ProjectFile 'lib/onboarding-draft.ts'
$welcome = Read-ProjectFile 'components/WelcomeAnimation.tsx'
$addLinks = Read-ProjectFile 'components/AddLinks.tsx'
$header = Read-ProjectFile 'components/Header.tsx'
$settings = Read-ProjectFile 'components/SettingsPanel.tsx'
$engine = Read-ProjectFile 'components/settings/EngineTab.tsx'
$main = Read-ProjectFile 'src-tauri/src/main.rs'
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
Assert-Contains $setup "id: 'welcome', label: 'onboardingStageWelcome'" 'The onboarding must expose a standalone welcome stage.'
Assert-Contains $setup "id: 'hardware', label: 'onboardingStageEquipment'" 'The onboarding must expose a standalone equipment stage.'
Assert-Contains $setup "id: 'intent', label: 'onboardingStagePreferences'" 'The three usage questions must share one progress stage.'
Assert-Contains $setup "includeLanguageStep \|\| item.id !== 'language'" 'Language must be omitted when the locale was already selected.'
Assert-Contains $setup "includeLanguageStep \? 'language' : 'intent'" 'The setup must route around the conditional language stage.'
Assert-Contains $setup "setIntentQuestion\(1\)" 'Intent question one must advance directly after selection.'
Assert-Contains $setup "setIntentQuestion\(2\)" 'Intent question two must advance directly after selection.'
Assert-Contains $setup "setIntentQuestion\(3\)" 'Intent question three must lead to the profile summary.'
Assert-Contains $setup "setStep\('storage'\)" 'The profile selection must advance to storage.'
Assert-Contains $page 'WelcomeAnimation' 'The first-run welcome animation must be mounted by the app shell.'
Assert-Contains $page 'pulsaria\.welcome-animation\.v1' 'The welcome animation completion must be persisted by version.'
Assert-Contains $page 'processingSetup\.runtimeReady' 'The welcome animation must wait for the native runtime preflight.'
Assert-Contains $processingHook "get_runtime_preflight" 'The processing hook must verify the native runtime before the welcome flow.'
Assert-Contains $welcome "t\('skipIntro'\)" 'The welcome animation must have an immediate, localized skip action.'
Assert-Contains $draft 'schemaVersion: 1' 'The onboarding draft must be versioned.'
Assert-Contains $draft "'offlinePlayback' in raw" 'The draft reader must remain compatible with the existing flat preferences format.'
Assert-Contains $setup 'writeOnboardingDraft\(draft\)' 'The wizard must save progress for resuming.'
Assert-Contains $setup "t\('onboardingPostpone'\)" 'The wizard must offer a localized postpone action.'
Assert-Contains $processingHook 'setupPostponed' 'Postponing must keep the main app accessible.'
Assert-Contains $page 'processingSetup\.resumeSetup' 'Home must expose the persistent setup resume action.'
Assert-Contains $settings 'setupPending\?: boolean' 'Settings must receive the pending setup state.'
Assert-Contains $engine "t\('onboardingResume'\)" 'Settings > Engine must expose the setup resume action.'
Assert-Contains $processingHook 'RUNTIME_CHECK_TIMEOUT_MS = 30_000' 'Native startup checks must stop waiting after 30 seconds.'
Assert-Contains $processingHook 'requestId !== refreshRequestRef\.current' 'Late results from older startup checks must be ignored.'
Assert-Contains $setup 'runtimeTimedOut' 'A timeout must be distinct from a broken runtime.'
Assert-Contains $setup "t\('onboardingRuntimeTimeoutDescription'\)" 'The timeout state must explain retry and postpone without declaring failure.'
Assert-Contains $commands 'runtime_manifest_check' 'The native preflight must validate the installed runtime manifest.'
Assert-Contains $commands 'Manifiesto incorrecto' 'Manifest problems must be distinguishable from worker file/import failures.'
Assert-Contains $commands 'Faltan archivos Workers Python' 'Missing worker files must be identified explicitly.'
Assert-Contains $commands 'Los imports de workers Python fallaron' 'Worker import failures must be identified explicitly.'
Assert-Contains $setup 'resourceAction\(resource\)' 'Failed resources must include actionable recovery guidance.'
Assert-Contains $setup 'quit_onboarding' 'The onboarding close action must use a dedicated native exit command.'
Assert-Contains $main 'commands::quit_onboarding' 'The dedicated onboarding exit command must be registered.'
Assert-Contains $main 'ExitSignal\(pub\(crate\) Arc<AtomicBool>\)' 'Onboarding exit must bypass close-to-tray without changing other closes.'
Assert-Contains $header 'useWindowControls\(onClose\?' 'Window controls must allow onboarding-specific close behavior.'
Assert-Contains $setup 'WindowControls controls=\{windowControls\}' 'Window controls must remain mounted during onboarding.'
Assert-Contains $addLinks 'focusSignal\?: number' 'AddLinks must accept the first-video focus request.'
Assert-Contains $addLinks 'firstUrlInputRef\.current\?\.focus' 'The first-video route must focus the existing input.'
Assert-Contains $addLinks "status: 'accepted', progress: 0" 'Queue acceptance must not be presented as a completed video.'
Assert-Contains $addLinks 'result\.accepted\.length > 0' 'A failed submission must remain visible for retry.'
if ($addLinks -match "status: 'done'") {
    throw 'Queue acceptance must not use the completed-job status.'
}
Assert-Contains $page 'result\.accepted\.find' 'Only a backend-accepted video may be tracked as the first video.'
Assert-Contains $page 'completedJobs\.some\(\(job\) => job\.id === firstVideoJob\.id\)' 'The first video is ready only after success and library inclusion.'
Assert-Contains $page "t\('onboardingFirstVideoReady'\)" 'The success message must be driven by the canonical job and library state.'
Assert-Contains $page 'focusSignal=\{focusAddLinksSignal\}' 'The completion CTA must hand focus to the AddLinks input.'
Assert-Contains $addLinks 'RIGHTS_KEY' 'The existing content-rights consent must remain in the AddLinks flow.'
if ($commands -match 'Reinstala Pulsaria|Runtime incompleto\. Reinstala') {
    throw 'Runtime diagnostics must not recommend a generic reinstall.'
}
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
    visualStagesWhenLanguageIsNeeded = 6
    visualStagesWhenLanguageIsAlreadyChosen = 5
    groupedPreferenceQuestions = 3
    conditionalLanguage = $true
    versionedResumableDraft = $true
    timeoutSeconds = 30
    actionableRuntimeChecks = $true
    postponeAndResume = $true
    onboardingExitBypassesTray = $true
    firstVideoCompletionUsesCanonicalJob = $true
    directSelectionAdvance = $true
    automaticUpdateCheckIntervalHours = 24
    activeJobInstallBlock = $true
    legalVersion = '0.1'
} | ConvertTo-Json -Depth 4

Write-Host 'PULSARIA ONBOARDING CONTRACT: PASS'
