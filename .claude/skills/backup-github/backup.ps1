param([string]$Message = "site update")
$ErrorActionPreference = "Stop"

# project root = three levels up from .claude/skills/backup-github
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot))
Set-Location $root

if (-not (Test-Path (Join-Path $root ".git"))) {
    Write-Host "No git repo here. Run 'git init' first (see SKILL.md)." ; exit 1
}

$ts = Get-Date -Format "yyyy-MM-dd HH:mm"
git add -A

$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to back up — working tree is clean." ; exit 0 }

$count = ($staged | Measure-Object -Line).Lines
git commit -m "backup: $Message - $ts" | Out-Null
Write-Host "Committed $count changed file(s): 'backup: $Message - $ts'"

# Push only if a remote is configured
$hasRemote = (git remote) -contains "origin"
if (-not $hasRemote) {
    Write-Host "Committed locally. No 'origin' remote yet — see SKILL.md to connect the p2k-music.com repo, then run this again to push."
    exit 0
}

$branch = git rev-parse --abbrev-ref HEAD
git push -u origin $branch
Write-Host "Backed up to GitHub (origin/$branch)."
