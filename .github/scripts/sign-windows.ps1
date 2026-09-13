[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = 'Stop'
$resolvedPath = [System.IO.Path]::GetFullPath($Path)
if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
    throw "Binary to sign was not found: $resolvedPath"
}

$certificateBase64 = [Environment]::GetEnvironmentVariable('WINDOWS_CERTIFICATE_BASE64', 'Process')
$certificatePassword = [Environment]::GetEnvironmentVariable('WINDOWS_CERTIFICATE_PASSWORD', 'Process')
$timestampUrl = [Environment]::GetEnvironmentVariable('WINDOWS_TIMESTAMP_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($certificateBase64) -or [string]::IsNullOrWhiteSpace($certificatePassword) -or [string]::IsNullOrWhiteSpace($timestampUrl)) {
    throw 'Windows signing secrets are not configured in the release environment.'
}

$signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($null -eq $signTool) {
    $signTool = Get-ChildItem -LiteralPath (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin') -Filter signtool.exe -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
}
if ($null -eq $signTool) { throw 'signtool.exe was not found on the Windows runner.' }
$signToolPath = if ($signTool.PSObject.Properties.Name -contains 'Source') { $signTool.Source } else { $signTool.FullName }

$pfxPath = Join-Path ([IO.Path]::GetTempPath()) "pulsaria-sign-$([Guid]::NewGuid().ToString('N')).pfx"
$thumbprint = $null
try {
    [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($certificateBase64))
    $securePassword = ConvertTo-SecureString $certificatePassword -AsPlainText -Force
    $certificates = @(Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\CurrentUser\My' -Password $securePassword)
    $certificate = $certificates | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
    if ($null -eq $certificate -or [string]::IsNullOrWhiteSpace($certificate.Thumbprint)) {
        throw 'The temporary Authenticode certificate could not be imported.'
    }
    $thumbprint = $certificate.Thumbprint

    & $signToolPath sign /fd sha256 /sha1 $thumbprint /tr $timestampUrl /td sha256 $resolvedPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "signtool sign failed for $resolvedPath" }
    & $signToolPath verify /pa /all $resolvedPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "signtool verification failed for $resolvedPath" }
} finally {
    if ($thumbprint) {
        Remove-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $pfxPath -PathType Leaf) {
        Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
    }
}
