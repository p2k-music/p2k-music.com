#!/usr/bin/env bash
# Back up the whole project to the p2k-music.com GitHub repo.
set -e
cd "$(dirname "$0")/../../.."   # -> project root

if [ ! -d .git ]; then
  echo "No git repo here. Run 'git init' first (see SKILL.md)."; exit 1
fi

msg="${1:-site update}"
ts="$(date '+%Y-%m-%d %H:%M')"

git add -A
if git diff --cached --quiet; then
  echo "Nothing to back up — working tree is clean."; exit 0
fi

git commit -m "backup: $msg - $ts" >/dev/null
echo "Committed: 'backup: $msg - $ts'"

if ! git remote | grep -q '^origin$'; then
  echo "Committed locally. No 'origin' remote yet — see SKILL.md to connect p2k-music.com, then re-run to push."
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "$branch"
echo "Backed up to GitHub (origin/$branch)."
