<#
.SYNOPSIS
    Ralph Loop - Autonomous Test Loop for web_notepad.
.DESCRIPTION
    Runs the Antigravity CLI agent (agy) autonomously with prompt.md,
    verifies correctness via Playwright E2E tests, and displays Git status.
.PARAMETER Continuous
    Runs the loop infinitely with a 5-second delay.
.PARAMETER Interactive
    Waits for user input (keypress) before starting the next cycle.
.PARAMETER DryRun
    Simulates the loop run without executing the agent or Playwright tests.
#>
param(
    [switch]$Continuous,
    [switch]$Interactive,
    [switch]$DryRun
)

$ErrorLogPath = Join-Path $PSScriptRoot "error.log"
$PromptPath = Join-Path $PSScriptRoot "prompt.md"

# Locate the agy executable
$AgyPath = Get-Command agy -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $AgyPath) {
    $AgyPath = "C:\Users\ratho\AppData\Local\agy\bin\agy.exe"
}

function Print-Header {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "         RALPH WIGGUM LOOP ACTIVE        " -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
}

function Check-GitStatus {
    Write-Host "[*] Checking Git status..." -ForegroundColor Yellow
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $status = git status --short
        if ([string]::IsNullOrWhiteSpace($status)) {
            Write-Host "    Clean working directory." -ForegroundColor Green
        } else {
            Write-Host "    Modified/untracked files:" -ForegroundColor Cyan
            $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Cyan }
        }
    } else {
        Write-Host "    [!] Git command not found." -ForegroundColor DarkYellow
    }
}

function Run-LoopCycle {
    Print-Header
    Check-GitStatus
    
    if (-not (Test-Path $PromptPath)) {
        Write-Host "[!] prompt.md not found in the root directory." -ForegroundColor Red
        return 1
    }
    
    if ($DryRun) {
        Write-Host "[DRY RUN] Would execute: agy --prompt (Get-Content prompt.md -Raw) --dangerously-skip-permissions" -ForegroundColor Yellow
        Write-Host "[DRY RUN] Would execute: npm run test:harness" -ForegroundColor Yellow
        return 0
    }
    
    # 1. Run the agent autonomously
    Write-Host "[*] Running Antigravity Agent (agy)..." -ForegroundColor Yellow
    & $AgyPath --prompt (Get-Content $PromptPath -Raw) --dangerously-skip-permissions
    $agentExitCode = $LASTEXITCODE
    Write-Host "    Agent exited (Code: $agentExitCode)." -ForegroundColor Gray
    
    # 2. Run E2E Playwright tests to verify the agent's work
    Write-Host "[*] Running E2E Playwright tests..." -ForegroundColor Yellow
    $testResult = Invoke-Expression "npm run test:harness" 2>&1
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "[PASS] ALL TESTS PASSED!" -ForegroundColor Green
        if (Test-Path $ErrorLogPath) {
            Remove-Item $ErrorLogPath -Force
            Write-Host "    Removed stale error.log." -ForegroundColor Gray
        }
    } else {
        Write-Host ""
        Write-Host "[FAIL] TESTS FAILED (Exit Code: $exitCode)" -ForegroundColor Red
        Write-Host "    Saving diagnostics to error.log..." -ForegroundColor Red
        $testResult | Out-File -FilePath $ErrorLogPath -Force
        Write-Host "    error.log updated." -ForegroundColor Yellow
    }
    
    return $exitCode
}

# Main execution loop
do {
    $exitCode = Run-LoopCycle
    
    if ($Continuous) {
        Write-Host ""
        Write-Host "[*] Running in Continuous Mode. Sleeping for 5 seconds..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
    } elseif ($Interactive) {
        Write-Host ""
        Write-Host "[*] Interactive Mode: Press any key to run again, or Ctrl+C to exit..." -ForegroundColor Gray
        $null = [System.Console]::ReadKey($true)
    }
} while ($Continuous -or $Interactive)

exit $exitCode
