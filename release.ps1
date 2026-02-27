$ErrorActionPreference = "Stop"

Write-Host "========== LightPad Release Auto-Builder ==========" -ForegroundColor Cyan
Write-Host "Checking for uncommitted Git changes..." -ForegroundColor Yellow

$gitStatus = git status --porcelain
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "No changes detected in Git. Please make changes before releasing a new version." -ForegroundColor Red
    exit 1
}

# 1. Prompt for Commit Message
$commitMessage = Read-Host "Enter the commit message/release notes for this version"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    Write-Host "Commit message cannot be empty. Aborting." -ForegroundColor Red
    exit 1
}

# 2. Extract and Auto-Increment Version
Write-Host "`n[1/5] Bumping Version Numbers..." -ForegroundColor Cyan

$packageJsonPath = ".\package.json"
$packageContent = Get-Content $packageJsonPath -Raw
$currentVersionMatch = [regex]::Match($packageContent, '"version":\s*"([^"]+)"')
$currentVersion = $currentVersionMatch.Groups[1].Value

# Split version string gracefully (e.g. 1.0.1 -> 1, 0, 1)
$versionParts = $currentVersion.Split('.')
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

$newPatch = $patch + 1
$newVersion = "$major.$minor.$newPatch"

Write-Host "Version updating from $currentVersion -> $newVersion" -ForegroundColor Green

# Update package.json using exact string replacement to preserve formatting
$packageContent = $packageContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
Set-Content -Path $packageJsonPath -Value $packageContent -Encoding utf8

# Update tauri.conf.json using exact string replacement
$tauriConfigPath = ".\src-tauri\tauri.conf.json"
$tauriContent = Get-Content $tauriConfigPath -Raw
$tauriContent = $tauriContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
Set-Content -Path $tauriConfigPath -Value $tauriContent -Encoding utf8

# Ensure npm picks up the package change (optional, keeps lockfile in sync)
Write-Host "Syncing package-lock.json..." -ForegroundColor DarkGray
npm install --package-lock-only | Out-Null

# 3. Tauri Build Pipeline
Write-Host "`n[2/5] Building Optimized Tauri Executable v$newVersion..." -ForegroundColor Cyan
# Run the build BEFORE committing, in case the build generates any auto-files or modifies lockfiles.
npm run tauri build

# 4. Git Pipeline
Write-Host "`n[3/5] Committing and Pushing to Git..." -ForegroundColor Cyan
git add .
git commit -m $commitMessage
git tag "v$newVersion"
git push origin HEAD
git push origin "v$newVersion"
Write-Host "Git Push Successful." -ForegroundColor Green

# 5. Local Release Backup
Write-Host "`n[4/5] Copying to Local Releases Folder..." -ForegroundColor Cyan
$releaseDir = ".\releases\v$newVersion"
if (!(Test-Path -Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

$exeSourcePath = ".\src-tauri\target\release\LightPad.exe"

if (Test-Path -Path $exeSourcePath) {
    Copy-Item -Path $exeSourcePath -Destination "$releaseDir\LightPad.exe" -Force
    Write-Host "Successfully packaged to: $releaseDir\LightPad.exe" -ForegroundColor Green
}
else {
    Write-Host "CRITICAL ERROR: Tauri build failed to output LightPad.exe at $exeSourcePath!" -ForegroundColor Red
    exit 1
}


# 6. GitHub Release via GitHub CLI
Write-Host "`n[5/5] Publishing GitHub Release..." -ForegroundColor Cyan

# Check if gh CLI is installed and authenticated
$ghCheck = Get-Command gh -ErrorAction SilentlyContinue
if ($null -ne $ghCheck) {
    Write-Host "Using GitHub CLI to create release v$newVersion..." -ForegroundColor DarkGray
    # Create the release. 
    # v$newVersion is the git tag.
    # --title matches the version
    # --notes passes the commit message
    # And finally, attach the executable.
    gh release create "v$newVersion" "$releaseDir\LightPad.exe" --title "v$newVersion" --notes $commitMessage
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n>>> SUCCESS: LightPad v$newVersion successfully built and published to GitHub! <<<" -ForegroundColor Green
    }
    else {
        Write-Host "`n>>> ERROR: Failed to upload release to GitHub. Check your gh CLI permissions. <<<" -ForegroundColor Red
    }
}
else {
    Write-Host "GitHub CLI (gh) is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host "Skipping automatic upload to GitHub Releases." -ForegroundColor Yellow
    Write-Host "The build is available locally at: $releaseDir\LightPad.exe" -ForegroundColor Yellow
}

Write-Host "Process Completed." -ForegroundColor Cyan
