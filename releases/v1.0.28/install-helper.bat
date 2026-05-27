@echo off
:: ============================================================
:: LightPad Installer - Unblock & Run Helper
:: ============================================================
:: Corporate antivirus may quarantine files downloaded from the
:: internet. This script removes the "Mark of the Web" flag
:: and launches the installer.
::
:: HOW TO USE:
:: 1. Download LightPad-Setup.exe (or .msi) from GitHub Releases
:: 2. Place this .bat file in the SAME folder as the downloaded file
:: 3. Right-click this .bat file → "Run as administrator" is NOT needed
:: 4. Double-click this .bat file to run it
:: ============================================================

echo.
echo ========================================
echo   LightPad Installer Helper
echo ========================================
echo.

:: Unblock all LightPad files in the current directory
echo [1/2] Removing internet download restrictions...
PowerShell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Include 'LightPad*' -Recurse | Unblock-File -ErrorAction SilentlyContinue"
echo       Done.

:: Check which installer is available and run it
echo [2/2] Launching installer...
if exist "%~dp0LightPad-Setup.exe" (
    echo       Found: LightPad-Setup.exe
    start "" "%~dp0LightPad-Setup.exe"
    goto :done
)
if exist "%~dp0LightPad-Installer.msi" (
    echo       Found: LightPad-Installer.msi
    start "" msiexec /i "%~dp0LightPad-Installer.msi"
    goto :done
)
if exist "%~dp0LightPad-Portable.exe" (
    echo       Found: LightPad-Portable.exe
    start "" "%~dp0LightPad-Portable.exe"
    goto :done
)

echo       ERROR: No LightPad installer found in this folder.
echo       Please place this script next to the downloaded file.
pause
exit /b 1

:done
echo.
echo   LightPad is launching! You can close this window.
echo.
timeout /t 3 >nul
