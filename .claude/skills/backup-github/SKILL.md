---
name: backup-github
description: Back up the whole p2k-music project to the GitHub "p2k-music.com" repository — stages every change, commits with a timestamp, and pushes. Use whenever the user says "back up", "save to github", "push the site", "snapshot the project", or similar.
---

# Backup to GitHub — p2k-music.com

One command to snapshot the entire project (pages, `assets/`, `audio/`, ads.txt, everything) to GitHub with a timestamped commit + push.

## How to run it (every backup)

On Windows (default):
```
powershell -ExecutionPolicy Bypass -File ".claude/skills/backup-github/backup.ps1" "what changed"
```
Or with Git Bash:
```
bash ".claude/skills/backup-github/backup.sh" "what changed"
```
The message argument is optional. The script:
1. `git add -A` — stages every change (including new/renamed/deleted files).
2. Commits `backup: <message> — <YYYY-MM-DD HH:MM>` (and exits quietly if nothing changed).
3. `git push` to the `origin` remote on the current branch.

When invoked as a skill, run that command with the Bash/PowerShell tool, then report what was committed and pushed (or the exact error if the push failed).

## One-time setup (do this once)

Local git is already initialized and the first commit is made. To connect GitHub:

1. **Create the repo** on GitHub named exactly **`p2k-music.com`** (github.com → New repository → keep it empty, no README).
2. **Point this project at it** (replace `<USERNAME>` with the GitHub account):
   ```
   git remote add origin https://github.com/<USERNAME>/p2k-music.com.git
   ```
   (If a remote already exists, use `git remote set-url origin <url>` instead.)
3. **Authenticate the first push.** The GitHub CLI (`gh`) is not installed, so use one of:
   - **Git Credential Manager** — the first `git push` opens a browser to sign in (comes with Git for Windows).
   - **Personal Access Token** — create a classic PAT with `repo` scope and use it as the password when prompted, or bake it into the remote URL: `https://<USERNAME>:<TOKEN>@github.com/<USERNAME>/p2k-music.com.git`.

After that, every backup is just the one command above.

## Notes
- **Audio size:** the real tracks total a few hundred MB. GitHub blocks single files > 100 MB (none here exceed ~25 MB, so you're fine), but if the repo ever gets heavy, move audio to **Git LFS** (`git lfs track "audio/*"`).
- **Placeholders:** the local `audio/` folder may contain 1-byte preview placeholders. Replace them with the real files before a backup you rely on.
- To make backups **automatic**, this can be wired to a Stop hook or a scheduled task — ask and I'll set it up (requires non-interactive auth, e.g. a PAT in the remote URL).
