# P2K Music — Project Overview & Handoff

**Repo:** https://github.com/p2k-music/p2k-music.com  ·  **Owner:** P2K (`tajallatajalla2@gmail.com`)
**Site:** p2k-music.ca — P2K's official music artist website.
**Last updated:** 2026-07-06.

This is the single reference for the whole project: what it is, how to run it, every
feature, the backend API, configuration, security, and what's left to do. If you're a
new Claude/AI session or a new developer, **start here**, then see
[`CLAUDE.md`](CLAUDE.md) (quick orientation), [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md),
and [`server/README.md`](server/README.md).

---

## 1. What it is

A music artist website with a real backend. Fans can stream previews and buy tracks,
tickets, and merch; there's a podcast, tour dates, gallery, news, an admin CMS, an
earnings wallet, and a bonus in-browser file converter. Visual style: cyan/coral/gold
neon + glassmorphism, Orbitron/Inter fonts, animated aurora background.

## 2. Quick start (run it)

- **Requires Node 22+** (uses the built-in `node:sqlite`). Developed/tested on Node 26.
- No `npm install` — the backend uses only Node built-ins.
```
node server/server.js
```
Then open **http://localhost:8123**. First run creates `server/data/p2k.db` and seeds
config. Out of the box it runs in **DEMO mode** (PayPal + email are simulated/off) so
everything is testable locally.

Config lives in **`server/.env`** (copy from `server/.env.example`). `server/.env` and
`server/data/` are git-ignored — never commit them.

> The `.claude/launch.json` "p2k-site" config runs exactly this (`node server/server.js`).

## 3. Architecture

- **Frontend** — a static, multi-page site. **Every page shares `assets/styles.css` +
  `assets/app.js`** (the entire client). All client data persists in the browser via
  **IndexedDB** (`p2kMusicDB`, `DB_VERSION` 6): songs, images, purchases, tickets,
  events, podcast, guests, revenue, settings. **Rule: change shared behaviour in
  `assets/`, never per-page.**
- **Backend** — `server/`, Node built-ins only (`http`, `crypto`, `node:sqlite`,
  `tls`). Serves the static site **and** a JSON API. Source of truth for money/admin/
  tickets is the server; SQLite DB at `server/data/p2k.db`.
- **Pages** — `index.html` (Home), `about`, `music`, `podcast`, `videos`, `tour`,
  `gallery`, `merch`, `news`, `contact`, `admin`, and `converter/` (the file converter).
  Nav active-state via `<body data-page="…">`; a "Converter" link is injected into the
  nav/footer by `app.js`.

## 4. File map

| Path | What it is |
|---|---|
| `index.html`, `about.html`, `music.html`, `podcast.html`, `videos.html`, `tour.html`, `gallery.html`, `merch.html`, `news.html`, `contact.html`, `admin.html` | The site pages (share the assets below) |
| `assets/styles.css` | The entire design system + all component styles |
| `assets/app.js` | The entire client app (player, IndexedDB, admin, wallet, tickets, visuals, API calls) |
| `audio/` | 48 real tracks (mp3/mp4). 5 catalog entries have no file yet and auto-hide |
| `background.jpg` | The ribbon photo used as the site background (1920×1080, optimized) |
| `converter/index.html` | Standalone P2K-styled file converter tool |
| `server/config.js` | Config loader (reads `server/.env` + env) |
| `server/db.js` | SQLite schema + wallet math (money in integer cents) |
| `server/auth.js` | scrypt hashing, HMAC signed cookies, CSRF, rate limiting |
| `server/http.js` | Security headers/CSP + hardened static server (Range streaming, traversal guard) |
| `server/paypal.js` | PayPal Orders v2 + Payouts v1 (+ webhook), live or demo |
| `server/email.js` | Zero-dependency SMTP-over-TLS sender for 2FA codes (+ demo fallback) |
| `server/server.js` | The HTTP router (ties it all together) |
| `server/.env.example` | All config options, documented |
| `server/README.md` | Backend run/config/API summary |
| `SECURITY-AUDIT.md` | Full security posture, residual risks, go-live checklist |
| `.claude/launch.json` | Dev-server launch config (`node server/server.js`) |
| `.claude/skills/backup-github/` | "back up"/"push the site" skill: `git add -A` → timestamped commit → push |
| `ads.txt`, `ADSENSE-SETUP.md` | Google AdSense (publisher `ca-pub-2580922665149434`) |

## 5. Features (everything built)

- **Music catalog & player** — 53-track catalog (`DEFAULT_SONGS` in `app.js`); 48 have
  real files and play (30-second preview for non-owners; full track after purchase).
  `checkFileAvailability()` HEAD-checks each file and hides missing ones. Search/sort
  library bar on the Music page. Live Web-Audio visualizer + energy-swirl on the player.
- **Background visuals** — animated **aurora-orb nebula** (`#auroraField`, 6 drifting
  colour orbs) + a glowing multi-colour **particle constellation** with cursor parallax,
  layered over the ribbon **`background.jpg`** (tuned opacity + dark scrim for readability).
- **File converter** (`converter/`) — drag-and-drop image/audio/video/doc converter;
  real canvas image conversion, a credit system (localStorage), P2K neon-glass styled.
- **Admin area** (`admin.html`) — CMS to upload songs/images/background, publish news &
  podcast episodes, announce shows, run the door check-in scanner, and see the earnings
  wallet + profit dashboard. Gated by the 2FA login (§7).
- **Earnings wallet + payouts** — server-computed balance from verified sales + a
  configurable listen-royalty; withdraw via PayPal Payouts (atomic reservation,
  idempotent). Admin-only.
- **Payments** — songs ($16 CAD), tickets, merch via PayPal. Server creates + verifies
  the order before unlocking (live) / simulates (demo). Revenue recorded server-side.
- **Ticketing** — server-issued, HMAC-signed tickets with a QR that points at
  `/t/:code`; validate + one-time check-in from any device (fixes cross-device door scan).
- **Podcast / News / Gallery / Merch / Tour** — admin publishes; fans view/buy/apply.
- **AdSense + cookie consent** — ads gated behind a cookie-consent banner.

## 6. Backend API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET  /api/health` | — | mode + currency |
| `POST /api/admin/login` `{email,password}` | — | step 1: verify + email a one-time code |
| `POST /api/admin/verify` `{challenge,code}` | — | step 2: verify code → session (+CSRF) |
| `POST /api/admin/logout` | cookie | end session |
| `GET  /api/admin/session` | — | `{admin, email, csrf}` |
| `GET  /api/earnings` | admin | wallet summary |
| `POST /api/withdraw` `{amount}` | admin + CSRF | PayPal payout |
| `POST /api/listen-tick` | visitor | accrue listen earnings (anti-fraud) |
| `POST /api/orders` `{kind,ref,…}` | — | create a (PayPal) order |
| `POST /api/orders/:id/capture` | — | verify payment → unlock / issue ticket |
| `GET  /api/ticket/:code` | — | validate a ticket (door scanner) |
| `POST /api/ticket/:code/checkin` | admin + CSRF | mark ticket used |
| `POST /api/tickets/issue` | admin + CSRF | issue a comp/manual ticket |
| `GET  /api/revenue` | admin | verified revenue summary |
| `POST /api/paypal/webhook` | signature | reconciliation (live) |
| `GET  /t/:code` | — | public ticket-status page (the QR target) |

## 7. Admin login — two accounts + email 2FA (hardened, fail-closed)

- **Two accounts:** `tajallatajalla2@gmail.com` (P2K) and `aaron.styles9393@gmail.com`
  (Aaron). Each logs in with **email + password**, then a **6-digit one-time code**.
- Passwords are scrypt-hashed; codes are hashed, expire in 5 min, attempt-capped,
  and one-time. The session records which admin signed in.
- **Fail-closed:** the code is **only ever emailed**. The on-screen fallback is gated
  behind `DEV_SHOW_CODE` **and** is localhost-only, so a remote user can never see it.
  **With no SMTP configured, login returns `503` even for a correct password** — so you
  need the password *and* access to the email inbox.
- **Brute-force defence:** per-IP rate limiting + per-account lockout
  (`LOCK_THRESHOLD`/`LOCK_MINUTES`). Unknown email and wrong password return the same
  generic `401` (no user enumeration).
- **⚠️ To actually log in, SMTP must be configured** (see §8) so codes reach the inbox —
  otherwise the site is intentionally locked for everyone.

## 8. Configuration (`server/.env`)

Copy `server/.env.example` → `server/.env`. Key settings:

| Var | Meaning |
|---|---|
| `ADMIN1_EMAIL` / `ADMIN1_PASS`, `ADMIN2_EMAIL` / `ADMIN2_PASS` | The two admin accounts (blank password → generated + logged once) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Email sender for 2FA codes. **Gmail:** `SMTP_USER` = a gmail, `SMTP_PASS` = a Google **App Password**. Required in production |
| `DEV_SHOW_CODE` | Localhost-only dev flag to show the code on-screen. **Leave unset in production** |
| `CODE_TTL_MIN`, `CODE_MAX_ATTEMPTS`, `LOCK_THRESHOLD`, `LOCK_MINUTES` | 2FA / lockout tuning |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | Set both to go **live** (else DEMO). `PAYPAL_ENV` = `sandbox`/`production` |
| `PAYOUT_EMAIL` | Where withdrawals are sent (`p2key1@gmail.com`) |
| `SONG_PRICE`, `CURRENCY`, `MIN_WITHDRAW`, `LISTEN_RATE_PER_MIN` | Money settings |
| `BEHIND_TLS` | `true` when served over HTTPS (Secure cookies + HSTS) |

## 9. Security

The backend replaced a client-only site where the admin passcode lived in JS, payments
were an honor-system button, and tickets were forgeable. Now: server-verified 2FA admin
auth, PayPal-verified payments, HMAC-signed tickets, anti-fraud listen wallet, PayPal
payouts, CSP + security headers, Range-streaming static server with traversal guard.
**Full detail + residual risks in [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md).**

## 10. Go-live checklist

1. `cp server/.env.example server/.env`; set the two admin passwords.
2. **Configure SMTP** (`SMTP_USER` + a Google App Password) so 2FA codes email — until
   then nobody can log in.
3. Serve behind **HTTPS**; set `BEHIND_TLS=true`.
4. For real payments: set `PAYPAL_CLIENT_ID`/`SECRET`, `PAYPAL_ENV=production`, a webhook
   id, and finish the live-capture wiring (SECURITY-AUDIT R4).
5. Confirm the PayPal payout account vs receive account (SECURITY-AUDIT B2) and how listen
   earnings count toward withdrawals (B1).
6. Drop in the 5 missing tracks (below) if desired.

## 11. Outstanding / caveats

- **5 catalog tracks have no audio file** (auto-hidden until added): `DEEZY ME !.mp3`,
  `P2K EKA JENVA !.mp3`, `p2k sec verse diferrent flow Top Of The World.mp3`,
  `p2k_freestyle_7.mp3`, `p2k_haupate^^.mp3` — drop real files into `audio/` with these
  exact names and they reappear.
- **Rights/licensing:** some catalog tracks look like other artists'/remixes — selling
  them + running ads needs P2K to own/license them (legal, not code).
- Residual security items (see audit): gate raw `audio/` download URLs (R2), server-side
  event/merch pricing (R3), ~~PayPal JS SDK for real capture (R4)~~ **DONE — real
  approve→capture checkout is wired (see §15)**, listen-earnings are a projection (B1),
  same-account payout question (B2).
- ~~PR #1 (`admin-2fa-login`)~~ — **merged into `main`** (commit `dade236`).

## 12. Backups & GitHub

- Remote `origin` = `https://github.com/p2k-music/p2k-music.com.git`. Git Credential
  Manager auth is cached (push works). **Commit as P2K** (`P2K <tajallatajalla2@gmail.com>`).
- Backup skill: say "back up" / "push the site" → it stages, timestamped-commits, pushes.
- `.gitignore` excludes secrets (`server/.env`), runtime data (`server/data/`), zips, and
  raw upload dupes.

## 13. What was done this session (2026-07-06)

Added the 48 real tracks; re-envisioned the background (aurora + constellation + ribbon
photo); built the entire zero-dependency Node backend (auth, PayPal payments, wallet,
payouts, tickets) + `SECURITY-AUDIT.md`; restyled the file converter into the site theme
and linked it; pushed the project to GitHub and re-credited all history to P2K; then
built the **two-account email-2FA admin login** and hardened it (fail-closed, lockout,
no enumeration) — merged as PR #1.

**Enterprise-hardening pass (later on 2026-07-06)** — full multi-agent audit, every
finding verified, then fixed:
- **Server security**: case-insensitive static-server block-list (Windows/macOS `/SERVER/…`
  could previously download the SQLite DB + signing secret); malformed-cookie 500 fixed;
  `Cache-Control: no-store` on all API JSON; webhook body size-capped; lockout state now
  revealed only after a correct password (no enumeration/lock oracle).
- **Money integrity**: order capture made idempotent under concurrent requests (no double
  revenue rows); PayPal capture rejects a missing/wrong `currency_code` (fail closed);
  listen-tick no longer counts a freshly minted visitor identity (cookie-mint bypass of
  the per-visitor cap closed).
- **Ops**: fail-fast config validation at boot; deep `/api/health` (DB probe + uptime);
  structured request logging (`LOG_REQUESTS`); graceful SIGINT/SIGTERM drain;
  uncaughtException/unhandledRejection logging; header/request/keep-alive timeouts;
  SQLite `synchronous=NORMAL` + `busy_timeout` + retention pruning (login codes, ip_day,
  dormant visitors); SMTP client no longer hangs on clean disconnect and accepts a
  display-name `SMTP_FROM`; legacy single-passcode code path removed.
- **Front end**: all dynamic renders now HTML-escape (song titles, comments, news,
  gallery); dead duplicate `updateAdminUI` removed; admin page prompts login from the
  server session (legacy localStorage gate removed); placeholder AdSense units hidden;
  News added to the navbar (+ active-state CSS); favicon + Open Graph/Twitter cards on
  every page; keyboard access + aria-labels on cards/forms; `prefers-reduced-motion` +
  `:focus-visible` support; track count corrected to 53; admin copy matches the 2FA flow;
  contact page license contradiction fixed (all rights reserved, licensing via booking).
- **Repo**: removed cruft (`index - Copy.html`, `index.original.backup.html`,
  `p2k website instruct.txt` — the last was publicly web-served).

## 15. End-to-end PayPal checkout (R4 closed)

Real buyer-approval checkout replaces the old honor-system `_xclick` links.

- **Live mode** (both PayPal creds set): pages load the PayPal **JS SDK Buttons**. The
  buyer approves in PayPal's popup; the server **creates** the order (`POST /api/orders`,
  server-authoritative song price) and **captures + verifies** it
  (`POST /api/orders/:id/capture`) before anything unlocks. Songs, paid tickets, and
  merch all run through one shared `mountCheckout()` helper in `assets/app.js`.
- **Demo mode** (no live creds): the same helper renders a "Pay with PayPal — demo"
  button that drives the identical server create→capture path (simulated), so the flow
  is fully testable locally. The site auto-switches to real Buttons the moment both
  `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` are set (server restart).
- **Free RSVP tickets** ($0) skip PayPal entirely and still get a server-signed ticket.
- New `GET /api/config` exposes `mode` + the **public** PayPal client id (only when
  live). CSP extended with `*.paypalobjects.com` for the SDK.
- **Config**: set `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` (+ `PAYPAL_ENV=sandbox` to test,
  `production` to go live) in `server/.env`. Client id is public; the secret is not.
- **Still open**: event/merch prices are client-supplied (R3) — a server-side product
  catalog would let capture re-price authoritatively; recommended before high volume.

## 14. Working on this project with Claude

- **Identity:** always commit/push as **P2K** (`git config user.name "P2K"`,
  `user.email "tajallatajalla2@gmail.com"`); the remote is P2K's. Never author as Aaron.
- **Shared code:** edit `assets/styles.css` / `assets/app.js`, not per-page copies.
- **Run/verify:** `node server/server.js`; it's DEMO-safe with no external accounts.
- **Secrets:** never commit `server/.env` or `server/data/`; never paste passwords/tokens
  into chat.
- **Money:** the server is the source of truth (integer cents); don't trust client totals.
