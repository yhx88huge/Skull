# Enables WSL2 so Docker Desktop can start its engine.
# Run it by right-click -> "Run with PowerShell". It will ask for administrator
# privileges (UAC) by itself, then you just need to restart the computer.
#
# Note: this is a machine setup helper, not part of the game project.

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin) {
    Write-Host "Requesting administrator privileges..."
    Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    exit
}

Write-Host ""
Write-Host "[1/3] Enabling Windows Subsystem for Linux..."
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host ""
Write-Host "[2/3] Enabling Virtual Machine Platform..."
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host ""
Write-Host "[3/3] Installing the WSL2 kernel (downloads from the web)..."
wsl.exe --update --web-download
wsl.exe --set-default-version 2

Write-Host ""
Write-Host "=============================================="
Write-Host " Done."
Write-Host " Please RESTART the computer now."
Write-Host " After reboot, open Docker Desktop and accept"
Write-Host " the subscription agreement if it shows up."
Write-Host "=============================================="
Write-Host ""
Read-Host "Press Enter to close"
