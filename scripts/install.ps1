# Qore installer for Windows - downloads the latest binary release from GitHub
$ErrorActionPreference = "Stop"

$Repo = "Kodjaoglanian/qore"
$InstallDir = "$env:LOCALAPPDATA\Qore"
$BinaryName = "qore.exe"

Write-Host ""
Write-Host "  Qore - Infrastructure Orchestrator"
Write-Host ""

# Detect architecture
$Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }

$AssetName = "qore-windows-$Arch.exe"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$AssetName"

# Create install directory
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Download the binary
Write-Host "  Downloading Qore for windows/$Arch..."
$DestPath = Join-Path $InstallDir $BinaryName
Invoke-WebRequest -Uri $DownloadUrl -OutFile $DestPath

Write-Host ""
Write-Host "  Installed to: $DestPath"
Write-Host ""

# Check if install dir is in PATH
$Path = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($Path -notlike "*$InstallDir*") {
    Write-Host "  Adding $InstallDir to your PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$Path;$InstallDir", "User")
    Write-Host "  PATH updated. Restart your terminal for changes to take effect."
} else {
    Write-Host "  Qore is ready. Run: qore"
}

Write-Host ""
Write-Host "  To update later, run: qore update"
Write-Host ""
