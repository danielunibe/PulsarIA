. (Join-Path $PSScriptRoot 'file-integrity.ps1')

function Resolve-InstalledBundlePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$BundleRoot,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [ValidateSet('nsis', 'msi')][string]$Bundle = 'nsis',
        [string]$InstallerPath,
        [ValidatePattern('^$|^[A-Fa-f0-9]{64}$')][string]$ExpectedSha256
    )

    $installerName = if ($Bundle -eq 'nsis') {
        "Pulsaria_${ReleaseVersion}_x64-setup.exe"
    } else {
        "Pulsaria_${ReleaseVersion}_x64_en-US.msi"
    }
    if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
        $InstallerPath = Join-Path (Join-Path $BundleRoot $Bundle) $installerName
    }
    if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
        throw "The exact $ReleaseVersion $Bundle installer is missing: $InstallerPath"
    }
    $resolvedPath = (Resolve-Path -LiteralPath $InstallerPath).Path
    if ([IO.Path]::GetFileName($resolvedPath) -ne $installerName) {
        throw "Installer name must match the expected release version: $installerName"
    }
    if ($ExpectedSha256 -and (Get-PulsariaSha256 -Path $resolvedPath) -ne $ExpectedSha256) {
        throw 'Installer SHA-256 differs from the candidate selected for acceptance.'
    }
    return $resolvedPath
}

function Assert-InstallerHostIsIsolated {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$ProductName)

    foreach ($registryRoot in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )) {
        $installed = @(Get-ItemProperty -Path "$registryRoot\*" -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq $ProductName })
        if ($installed.Count -gt 0) {
            throw "The $ProductName installation smoke requires an isolated Windows account or VM. An existing installation is registered on this host."
        }
    }
}
