---
name: p2k-handoff
description: "START HERE when resuming P2K's site — current state, where the full docs live, and the immediate next steps."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c81bb46-4ae8-40a5-8d60-1691431428b0
---

**Entry point for the p2k-music.com project.** When resuming a session on this repo
(`C:\Users\p2k\Downloads\p2k-Aaron-WEBSITE-help`), read this first, then pull detail from
the sources below.

## Where the comprehensive reference lives
- **In the repo (transferable to P2K's own Claude account):** `PROJECT-OVERVIEW.md` (full
  write-up), `CLAUDE.md` (short auto-loaded orientation), `SECURITY-AUDIT.md`,
  `server/README.md`. These were committed 2026-07-06 on branch **`admin-2fa-login`**
  (PR #1) — land on `main` when that PR merges.
- **In memory (this instance):** [[p2k-site-project]] = the detailed, chronological
  build log of everything. [[p2k-git-ownership]] = commit/push as P2K, never Aaron.
  [[aaron-working-style]] = Aaron wants flashy visuals, kept aesthetic, previews, autonomy.

## Current state (end of 2026-07-06 session)
- Full zero-dependency Node backend (`server/`) built + pushed to
  `github.com/p2k-music/p2k-music.com` (all history re-credited to P2K). 48 real tracks
  live; aurora + ribbon-photo (`background.jpg`) background; file converter restyled.
- **Admin login = 2-account email-2FA, hardened fail-closed** — in **PR #1**
  (`admin-2fa-login`, unmerged). Accounts: `tajallatajalla2@gmail.com` (P2K) +
  `aaron.styles9393@gmail.com` (Aaron); Aaron set his own passwords in `server/.env`.
- Everything runs in **DEMO mode** (PayPal + email off). **The admin login is currently
  BLOCKED for everyone** because it fails closed and no SMTP is configured — that is the
  intended "nobody else logs in" state, not a bug.

## Immediate next steps when we resume
1. **Merge PR #1** (`admin-2fa-login`) into `main`.
2. **Configure SMTP** so admin 2FA codes email out (Gmail: `SMTP_USER` + a Google App
   Password in `server/.env`) — required before anyone (incl. P2K/Aaron) can log in.
3. Add PayPal live creds (`PAYPAL_CLIENT_ID`/`SECRET`, `PAYPAL_ENV=production`) to leave demo.
4. Production: serve over HTTPS + set `BEHIND_TLS=true`.
5. Optional: drop the 5 missing tracks into `audio/`; revisit the rights/licensing caution.

## Run / preview
`node server/server.js` → http://localhost:8123 (or the `.claude/launch.json` "p2k-site").
Note: `preview_screenshot` times out in this env (constant animation + AdSense polling) —
verify visuals with `preview_inspect`/`eval`.
