function Get-PulsariaSha256 {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}
