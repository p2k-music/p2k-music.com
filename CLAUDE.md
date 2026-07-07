# CLAUDE.md — p2k-music.com

Project guidance for Claude. **Read [`PROJECT-OVERVIEW.md`](PROJECT-OVERVIEW.md) first**
for the full picture (features, file map, API, config, security, TODOs).

## What this is
P2K's music artist website (p2k-music.ca): a static multi-page front end + a
zero-dependency Node backend. Sells tracks/tickets/merch (PayPal), plus podcast, tour,
gallery, admin CMS, earnings wallet, and an in-browser file converter.

## Run it
- Node 22+ required (uses built-in `node:sqlite`). No `npm install`.
- `node server/server.js` → serves the whole site + API at http://localhost:8123.
- Config: `server/.env` (copy `server/.env.example`). Runs in **DEMO mode** with no
  external accounts (PayPal + email simulated/off), so it's safe to run and test locally.

## Architecture (know this before editing)
- **Front end is multi-page and shares `assets/styles.css` + `assets/app.js`.** Change
  shared behaviour there, **never per-page**. Client data persists in IndexedDB
  (`p2kMusicDB`).
- **Backend** = `server/` (Node built-ins only): `config.js`, `db.js` (SQLite, money in
  integer cents), `auth.js` (scrypt/cookies/CSRF/rate-limit), `http.js` (headers + static
  server), `paypal.js`, `email.js`, `server.js` (router). The **server is the source of
  truth** for money/admin/tickets — don't trust client totals.

## Conventions / must-dos
- **Identity — commit & push as P2K, never Aaron:**
  `git config user.name "P2K"` and `user.email "tajallatajalla2@gmail.com"`.
  Remote `origin` is `github.com/p2k-music/p2k-music.com`. Backup: say "back up" / "push
  the site" (the `backup-github` skill).
- **Secrets:** never commit `server/.env` or `server/data/` (git-ignored); never paste
  passwords/tokens into chat.
- **Verify changes** by running `node server/server.js` and checking the page/API.

## Admin login is 2FA + fail-closed
Two accounts (P2K + Aaron emails), email + password, then a 6-digit code that is **only
emailed**. **With no SMTP configured, login is intentionally blocked (503) even with the
right password** — set `SMTP_USER` + a Google App Password in `server/.env` to enable it.
`DEV_SHOW_CODE=1` shows the code on-screen for localhost dev only.

## Current state / next steps
- 2FA login (PR #1) is **merged into `main`**; a full audit + enterprise-hardening pass
  landed 2026-07-06 (see `PROJECT-OVERVIEW.md` §13).
- To make admin usable: configure SMTP. To take payments: add PayPal live creds. For
  production: HTTPS + `BEHIND_TLS=true`.
- See `SECURITY-AUDIT.md` for the full go-live checklist and residual risks.
