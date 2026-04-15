param (
    [string]$Thumbprint = "0653CD08D62617B0CF0C48FCCB373F3498016AF2"
)

Write-Host "Starting Vite Dev Server..." -ForegroundColor Cyan
$viteJob = Start-Job -ScriptBlock {
    Set-Location -Path $using:PWD
    npm run dev
}

# Wait for Vite to boot up
Start-Sleep -Seconds 2

Write-Host "Compiling Rust Backend..." -ForegroundColor Cyan
Push-Location src-tauri
cargo build
$buildResult = $LASTEXITCODE
Pop-Location

if ($buildResult -ne 0) {
    Write-Host "Rust build failed. Stopping Vite." -ForegroundColor Red
    Stop-Job $viteJob
    Remove-Job $viteJob -Force
    exit 1
}

$exePath = "src-tauri\target\debug\lightpad.exe"

if (Test-Path $exePath) {
    Write-Host "Signing Executable with Self-Signed Certificate..." -ForegroundColor Yellow
    $cert = Get-Item "Cert:\CurrentUser\My\$Thumbprint" -ErrorAction SilentlyContinue
    if (-not $cert) {
        Write-Host "Certificate not found!" -ForegroundColor Red
        Stop-Job $viteJob
        Remove-Job $viteJob -Force
        exit 1
    }

    Set-AuthenticodeSignature -FilePath $exePath -Certificate $cert | Out-Null
    Write-Host "Signature applied." -ForegroundColor Green

    Write-Host "Launching App..." -ForegroundColor Cyan
    
    # We must pass the correct DEV URL directly to the built executable
    # The WEBKIT_DISABLE_COMPOSITING_MODE is just a common helper, we can ignore it
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--auto-open-devtools-for-tabs"
    
    & $exePath

    Write-Host "App Closed. Stopping Vite." -ForegroundColor Cyan
} else {
    Write-Host "Executable not found at $exePath." -ForegroundColor Red
}

Stop-Job $viteJob
Remove-Job $viteJob -Force
