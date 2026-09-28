[CmdletBinding()]
param(
    [string]$SourceRoot,
    [switch]$RequireSbom,
    [string]$SbomPath
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }

function Get-Sha256Hex([string]$Path) {
    $getFileHash = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($null -ne $getFileHash) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
    }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

Push-Location -LiteralPath $SourceRoot
try {
    $blockers = [System.Collections.Generic.List[string]]::new()
    $required = @(
        'LICENSE', 'EULA.es.md', 'EULA.en.md', 'TERMS_OF_USE.es.md', 'TERMS_OF_USE.en.md',
        'PRIVACY.es.md', 'PRIVACY.en.md', 'CONTENT_POLICY.es.md', 'CONTENT_POLICY.en.md',
        'COPYRIGHT_AND_TAKEDOWN.es.md', 'COPYRIGHT_AND_TAKEDOWN.en.md', 'THIRD_PARTY_NOTICES.md',
        'MODEL_NOTICE.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
        'docs/RELEASE_COMPLIANCE.md', 'legal/release-manifest.json', 'src-tauri/resources/local-llm-manifest.json'
    )
    foreach ($relative in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot $relative) -PathType Leaf)) { $blockers.Add("Missing required release file: $relative") }
    }

    $license = Get-Content -LiteralPath (Join-Path $SourceRoot 'LICENSE') -Raw
    if ($license -notmatch 'Pulsaria Source-Visible Beta License') { $blockers.Add('Root LICENSE is not the Pulsaria source-visible beta license.') }
    if ($license -match '(?im)^MIT License\s*$') { $blockers.Add('The old MIT license is still the root source license.') }
    $notices = Get-Content -LiteralPath (Join-Path $SourceRoot 'THIRD_PARTY_NOTICES.md') -Raw
    if ($notices -match 'COMPONENT_LICENSE_REVIEW_PENDING|REVIEW_REQUIRED|INVENTORY_REQUIRED|Pending release scan|Verify exact shipped build|Verify exact version|Verify model card/license|Verify during release build') { $blockers.Add('THIRD_PARTY_NOTICES.md still contains an unresolved component license review.') }
    if ($RequireSbom) {
        if ([string]::IsNullOrWhiteSpace($SbomPath) -or -not (Test-Path -LiteralPath $SbomPath -PathType Leaf)) { $blockers.Add('The release SBOM was not generated or supplied to the legal gate.') }
        else {
            try {
                $sbom = Get-Content -LiteralPath $SbomPath -Raw | ConvertFrom-Json
                if ([string]$sbom.spdxVersion -ne 'SPDX-2.3') { $blockers.Add('The release SBOM must be SPDX-2.3 JSON.') }
                $purls = @($sbom.packages | ForEach-Object { $_.externalRefs } | ForEach-Object {
                    $_ | Where-Object { $_.referenceType -eq 'purl' } | ForEach-Object { [string]$_.referenceLocator }
                })
                foreach ($ecosystem in @('npm', 'cargo', 'pypi')) {
                    if (-not ($purls | Where-Object { $_ -like "pkg:$ecosystem/*" })) { $blockers.Add("Release SBOM has no $ecosystem package inventory.") }
                }
                $coloramaPurl = 'pkg:pypi/colorama@0.4.6'
                $coloramaPackage = $sbom.packages | Where-Object {
                    $_.externalRefs | Where-Object { $_.referenceType -eq 'purl' -and $_.referenceLocator -eq $coloramaPurl }
                } | Select-Object -First 1
                $coloramaLicenseRelative = 'src-tauri/resources/python/Lib/site-packages/colorama-0.4.6.dist-info/licenses/LICENSE.txt'
                $coloramaLicensePath = Join-Path $SourceRoot $coloramaLicenseRelative
                $coloramaLicenseFile = $sbom.files | Where-Object { [string]$_.comment -like "Pulsaria third-party license file: $coloramaPurl;*" } | Select-Object -First 1
                if ($null -eq $coloramaPackage -or [string]$coloramaPackage.licenseDeclared -ne 'BSD-3-Clause') {
                    $blockers.Add('Release SBOM must declare Colorama 0.4.6 as BSD-3-Clause from its bundled license text.')
                }
                if (-not (Test-Path -LiteralPath $coloramaLicensePath -PathType Leaf) -or $null -eq $coloramaLicenseFile) {
                    $blockers.Add('Release SBOM or runtime source is missing Colorama 0.4.6 license text.')
                } else {
                    $coloramaHash = $coloramaLicenseFile.checksums | Where-Object { $_.algorithm -eq 'SHA256' } | Select-Object -First 1
                    if ($null -eq $coloramaHash -or [string]$coloramaHash.checksumValue -ne (Get-Sha256Hex -Path $coloramaLicensePath)) {
                        $blockers.Add('Release SBOM SHA-256 does not match the bundled Colorama 0.4.6 license text.')
                    }
                }
                $bundleConfig = Get-Content -LiteralPath (Join-Path $SourceRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
                $legalMappings = @($bundleConfig.bundle.resources.PSObject.Properties | Where-Object { [string]$_.Value -like 'resources/legal/*' })
                $expectedLegalDocuments = @(
                    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'MODEL_NOTICE.md', 'EULA.es.md', 'EULA.en.md',
                    'TERMS_OF_USE.es.md', 'TERMS_OF_USE.en.md', 'PRIVACY.es.md', 'PRIVACY.en.md',
                    'CONTENT_POLICY.es.md', 'CONTENT_POLICY.en.md', 'COPYRIGHT_AND_TAKEDOWN.es.md', 'COPYRIGHT_AND_TAKEDOWN.en.md'
                )
                foreach ($documentName in $expectedLegalDocuments) {
                    $destination = "resources/legal/$documentName"
                    $mapping = $legalMappings | Where-Object { [string]$_.Value -eq $destination } | Select-Object -First 1
                    if ($null -eq $mapping) {
                        $blockers.Add("Tauri bundle does not include legal resource: $destination")
                        continue
                    }
                    $sourcePath = Join-Path (Join-Path $SourceRoot 'src-tauri') ([string]$mapping.Name)
                    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
                        $blockers.Add("Tauri legal resource source is missing: $($mapping.Name)")
                        continue
                    }
                    $sbomFile = $sbom.files | Where-Object { [string]$_.comment -like "Pulsaria packaged legal file: $destination;*" } | Select-Object -First 1
                    if ($null -eq $sbomFile) {
                        $blockers.Add("Release SBOM is missing packaged legal document: $documentName")
                        continue
                    }
                    $sbomHash = $sbomFile.checksums | Where-Object { $_.algorithm -eq 'SHA256' } | Select-Object -First 1
                    $sourceHash = Get-Sha256Hex -Path $sourcePath
                    if ($null -eq $sbomHash -or [string]$sbomHash.checksumValue -ne $sourceHash) {
                        $blockers.Add("Release SBOM SHA-256 does not match packaged legal document: $documentName")
                    }
                }
                $runtime = Get-Content -LiteralPath (Join-Path $SourceRoot 'src-tauri/resources/runtime-manifest.json') -Raw | ConvertFrom-Json
                $runtimeFiles = @($runtime.components | ForEach-Object { $_.files } | Where-Object {
                    $_.status -eq 'present' -and [string]$_.sha256 -match '^[A-Fa-f0-9]{64}$'
                })
                $sbomRuntimeFiles = @($sbom.files | Where-Object { [string]$_.comment -like 'Pulsaria runtime manifest path: *' })
                if ($runtimeFiles.Count -eq 0 -or $sbomRuntimeFiles.Count -ne $runtimeFiles.Count) {
                    $blockers.Add('Release SBOM does not cover every hashed runtime-manifest file.')
                } else {
                    foreach ($runtimeFile in $runtimeFiles) {
                        $runtimePath = ([string]$runtimeFile.path).Replace('\', '/')
                        $sbomFile = $sbomRuntimeFiles | Where-Object { [string]$_.comment -like "Pulsaria runtime manifest path: $runtimePath;*" } | Select-Object -First 1
                        if ($null -eq $sbomFile) {
                            $blockers.Add("Release SBOM is missing runtime file: $runtimePath")
                            continue
                        }
                        $sbomHash = $sbomFile.checksums | Where-Object { $_.algorithm -eq 'SHA256' } | Select-Object -First 1
                        if ($null -eq $sbomHash -or [string]$sbomHash.checksumValue -ne ([string]$runtimeFile.sha256).ToUpperInvariant()) {
                            $blockers.Add("Release SBOM SHA-256 does not match runtime file: $runtimePath")
                        }
                    }
                }
            } catch {
                $blockers.Add("Release SBOM could not be validated: $($_.Exception.Message)")
            }
        }
    }

    try { $manifest = Get-Content -LiteralPath (Join-Path $SourceRoot 'legal/release-manifest.json') -Raw | ConvertFrom-Json } catch { $blockers.Add('legal/release-manifest.json is invalid JSON.'); $manifest = $null }
    if ($null -ne $manifest) {
        $manifestFields = @('product_name','public_owner','source_license','binary_eula','supported_languages','content_scope','telemetry_policy','outbound_network_policy','third_party_notice','llm_sidecar_version','llm_model_id','llm_model_revision','llm_model_sha256','llm_model_license','release_version')
        foreach ($field in $manifestFields) {
            $value = $manifest.$field
            if ($null -eq $value -or ([string]$value).Trim().Length -eq 0) { $blockers.Add("Release manifest field is empty: $field") }
        }
        foreach ($field in @('public_owner','legal_contact_email','notice_address','legal_approval')) {
            if ([string]$manifest.$field -match 'TO BE COMPLETED|PENDING HUMAN REVIEW') { $blockers.Add("Release manifest still contains a release placeholder: $field") }
        }
        if ([string]$manifest.telemetry_policy -ne 'zero-telemetry') { $blockers.Add('Telemetry policy is not zero-telemetry.') }
        if ([string]$manifest.source_license -ne 'Pulsaria Source-Visible Beta License') { $blockers.Add('Manifest source license does not match LICENSE.') }
        try {
            $tauriConfig = Get-Content -LiteralPath (Join-Path $SourceRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
            if ([string]$manifest.release_version -ne [string]$tauriConfig.version) {
                $blockers.Add("Release manifest version ($($manifest.release_version)) does not match Tauri version ($($tauriConfig.version)).")
            }
        } catch {
            $blockers.Add('Tauri release version could not be read for manifest comparison.')
        }
    }

    try { $model = Get-Content -LiteralPath (Join-Path $SourceRoot 'src-tauri/resources/local-llm-manifest.json') -Raw | ConvertFrom-Json } catch { $blockers.Add('Local LLM manifest is invalid JSON.'); $model = $null }
    if ($null -ne $model) {
        if ([string]$model.download_url -notmatch '^https://') { $blockers.Add('Local model URL is not HTTPS.') }
        if ([string]$model.license_spdx -eq '' -or [string]$model.license_spdx -eq 'UNKNOWN') { $blockers.Add('Local model license is missing.') }
        if ([string]$model.sha256 -notmatch '^[0-9a-fA-F]{64}$') { $blockers.Add('Local model SHA-256 is not a 64-character hexadecimal value.') }
        $sidecarPath = Join-Path $SourceRoot ('src-tauri/resources/bin/' + [string]$model.sidecar_executable)
        if (-not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) { $blockers.Add("Bundled sidecar is missing: $($model.sidecar_executable)") }
    }

    $scanRoots = @('app','components','hooks','lib','python-workers','src-tauri/src','scripts','README.md','CONTRIBUTING.md','docs/RELEASE_PUBLICA.md','docs/MVP_STATUS.md','docs/SESSION_REPORT_AUTOGEN.md') |
        ForEach-Object { Join-Path $SourceRoot $_ } |
        Where-Object { Test-Path -LiteralPath $_ }
    $scanFiles = foreach ($root in $scanRoots) {
        if ((Get-Item -LiteralPath $root).PSIsContainer) { Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue } else { Get-Item -LiteralPath $root }
    }
    # The optional Gemini contract is allowed only in the native adapter. The
    # frontend gate separately rejects public keys and direct cloud endpoints.
    # This release gate still blocks real credentials and private keys anywhere
    # in the scanned source tree.
    $forbidden = @('NEXT_PUBLIC_[A-Z0-9_]*(API_KEY|TOKEN|SECRET)', 'AIza[0-9A-Za-z_-]{20,}', '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----')
    foreach ($file in $scanFiles | Where-Object { $_.Length -lt 32MB -and $_.FullName -notmatch 'verify-(legal-release|frontend-secrets|local-llm)\.ps1$' }) {
        if (Select-String -LiteralPath $file.FullName -Pattern $forbidden -Quiet -ErrorAction SilentlyContinue) { $blockers.Add("Cloud LLM/API reference remains in: $($file.FullName)") }
    }

    $tracked = @(git ls-files --cached --others --exclude-standard)
    $badArtifacts = $tracked | Where-Object { $_ -match '(^|[\\/])\.env$|\.pfx$|\.key$|\.sqlite(?:3)?$|\.db$|(^|[\\/])cookies?\.(json|txt|sqlite|db)$|(^|[\\/])sessions?\.(json|txt|sqlite|db)$' }
    foreach ($artifact in $badArtifacts) { $blockers.Add("Potential secret/private artifact in release tree: $artifact") }
    $historySecrets = git log --all --format= --patch -G 'AIza[0-9A-Za-z_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' -- app components hooks lib src-tauri/src scripts python-workers package.json package-lock.json .env.example 2>$null
    if (-not [string]::IsNullOrWhiteSpace(($historySecrets -join [Environment]::NewLine))) { $blockers.Add('Secret pattern found in Git history; review and purge before publishing.') }

    if ($blockers.Count -gt 0) {
        Write-Error ("PULSARIA LEGAL RELEASE GATE: BLOCKED`n - " + ($blockers -join "`n - "))
        exit 1
    }
    Write-Host 'PULSARIA LEGAL RELEASE GATE: PASS'
} finally { Pop-Location }
