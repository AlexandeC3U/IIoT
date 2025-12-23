# =============================================================================
# NEXUS Edge - Git Sync Script (PowerShell)
# Automatically commits and pushes changes to remote
# =============================================================================

$ErrorActionPreference = "Stop"

# Navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "                    NEXUS Edge - Git Sync                          " -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a git repository
try {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
} catch {
    Write-Host "Error: Not a git repository" -ForegroundColor Red
    exit 1
}

# Show current branch
$Branch = git branch --show-current
Write-Host "Branch: " -NoNewline -ForegroundColor Blue
Write-Host $Branch
Write-Host ""

# Show git status
Write-Host "Current changes:" -ForegroundColor Yellow
Write-Host "-------------------------------------------------------------------"
git status --short
Write-Host "-------------------------------------------------------------------"
Write-Host ""

# Check if there are changes to commit
$HasChanges = git status --porcelain
if (-not $HasChanges) {
    Write-Host "Working directory clean - nothing to commit" -ForegroundColor Green
    
    # Check if we need to push
    $Local = git rev-parse "@" 2>$null
    $Remote = git rev-parse "@{u}" 2>$null
    
    if (-not $Remote) {
        Write-Host "No upstream branch set" -ForegroundColor Yellow
    } elseif ($Local -eq $Remote) {
        Write-Host "Already up to date with remote" -ForegroundColor Green
    } else {
        Write-Host "Local commits not pushed. Pushing..." -ForegroundColor Yellow
        git push
        Write-Host "Pushed to remote" -ForegroundColor Green
    }
    exit 0
}

# Count changes
$Staged = (git diff --cached --numstat | Measure-Object -Line).Lines
$Unstaged = (git diff --numstat | Measure-Object -Line).Lines
$Untracked = (git ls-files --others --exclude-standard | Measure-Object -Line).Lines

Write-Host "Summary:" -ForegroundColor Blue
Write-Host "  Staged:    " -NoNewline
Write-Host "$Staged files" -ForegroundColor Green
Write-Host "  Modified:  " -NoNewline
Write-Host "$Unstaged files" -ForegroundColor Yellow
Write-Host "  Untracked: " -NoNewline
Write-Host "$Untracked files" -ForegroundColor Cyan
Write-Host ""

# Ask for commit message
Write-Host "Enter commit message (or 'q' to quit):" -ForegroundColor Yellow
$CommitMsg = Read-Host

# Check if user wants to quit
if ($CommitMsg -eq "q" -or $CommitMsg -eq "Q") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

# Validate commit message
if ([string]::IsNullOrWhiteSpace($CommitMsg)) {
    Write-Host "Error: Commit message cannot be empty" -ForegroundColor Red
    exit 1
}

# Add all changes
Write-Host ""
Write-Host "Adding all changes..." -ForegroundColor Blue
git add -A

# Commit
Write-Host "Committing..." -ForegroundColor Blue
git commit -m $CommitMsg

# Push to remote
Write-Host ""
Write-Host "Pushing to remote..." -ForegroundColor Blue
try {
    git push
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host "Successfully committed and pushed!" -ForegroundColor Green
    Write-Host "===================================================================" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "Push failed. You may need to pull first or set upstream:" -ForegroundColor Yellow
    Write-Host "  git pull --rebase"
    Write-Host "  git push -u origin $Branch"
}

