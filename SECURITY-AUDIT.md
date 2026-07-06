# p2k-music.ca — Security Audit

**Date:** 2026-07-06  ·  **Scope:** the new Node backend (`server/`) + the client
money/admin/ticket flows it replaces.  ·  **Reviewer:** Aaron (with Claude Code).

This audit records the vulnerabilities present in the client-only version of the
site, how the backend closes them, and the risks that remain to be addressed
before handling **real** money in production.

---

## 1. Summary

The site was fully client-side: the admin passcode lived in JavaScript, "payments"
were an honor-system button, tickets were generated (and thus forgeable) in the
browser, and the wallet/earnings endpoints it called did not exist. The new
backend introduces a server as the source of truth with defense-in-depth:
server-verified admin auth, PayPal-verified payments, HMAC-signed tickets,
an anti-fraud listen wallet, PayPal payouts, and hardened HTTP.

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| V1 | Admin passcode hard-coded in client JS (`199430`) | **Critical** | ✅ Fixed |
| V2 | Honor-system payments — goods unlocked with no verification | **Critical** | ✅ Fixed (live) / ⚠️ demo simulates |
| V3 | Forgeable client-generated tickets; door scanner blind cross-device | **High** | ✅ Fixed |
| V4 | Unauthenticated earnings/withdraw (money endpoints) | **High** | ✅ Fixed |
| V5 | Listen-tick earnings inflatable by bots | **High** | ✅ Mitigated |
| V6 | No security headers / transport hardening | **Medium** | ✅ Fixed |
| V7 | Static-file path traversal / source exposure | **Medium** | ✅ Fixed |
| V8 | No brute-force / rate limiting | **Medium** | ✅ Fixed |
| V9 | Unbounded request bodies (DoS) | **Low** | ✅ Fixed |

---

## 2. Vulnerabilities fixed

### V1 — Client-side admin passcode  *(Critical)*
**Before:** `const ADMIN_PASSCODE = '199430'` sat in `assets/app.js`; anyone who
opened DevTools could read it and unlock every admin panel.
**Now:** The passcode is verified only by the server (`POST /api/admin/login`),
stored as a **scrypt** hash (`server/auth.js`), compared in constant time. Success
issues an **HttpOnly, SameSite=Lax, HMAC-signed** session cookie the browser JS
cannot read. The client no longer contains the passcode. Seed your private code
via `P2K_ADMIN_PASSCODE` in `server/.env` (the app warns loudly while it is still
using the legacy default).

> The client `isAdmin` flag only toggles which panels are *shown*. Every
> privileged action (earnings, withdraw, check-in, issue-ticket) is enforced
> server-side by the cookie, so faking `isAdmin` in the console grants nothing.

### V2 — Honor-system payments  *(Critical)*
**Before:** "I've Completed Payment" marked a track owned with zero verification —
free music, and self-reported "revenue."
**Now:** Purchases go through `POST /api/orders` → `POST /api/orders/:id/capture`.
The **server sets the song price** ($16, not the client), and in **live** mode the
capture is verified against PayPal (Orders v2) before anything unlocks; a paid
order is recorded in the server `revenue` ledger. See **R4** — the live capture
still needs the PayPal JS SDK/webhook wired to be bullet-proof for real money.

### V3 — Forgeable tickets + blind door scanner  *(High)*
**Before:** Tickets were generated in the browser (`P2K-XXX-######`) and only ever
lived in *that* browser's IndexedDB, so the door scanner on another phone could not
validate them, and anyone could fabricate a code.
**Now:** Tickets are **issued server-side** with an **HMAC signature** over
`code+event+holder+issued_at` (`issueTicket`). Validation is cross-device:
`GET /api/ticket/:code` reports validity and detects forgery; `POST /api/ticket/:code/checkin`
(admin+CSRF) marks a ticket used exactly once; the QR's `https://p2k-music.ca/t/:code`
now resolves to a real server page showing VALID / ALREADY USED / FORGED. The client
falls back to local validation only when the backend is unreachable.

### V4 — Unauthenticated money endpoints  *(High)*
**Now:** `GET /api/earnings` and `POST /api/withdraw` require the admin session;
`withdraw` additionally requires a **CSRF token** (double-submit header). The
withdrawable balance is **computed by the server** from the verified ledger
(`sales + listen − payouts`), never trusted from the client. Withdrawals:
- reserve the balance **atomically** inside a SQLite `IMMEDIATE` transaction so two
  concurrent requests cannot double-spend;
- use an idempotent `sender_batch_id` so a retry cannot double-pay;
- on a network error mid-payout, the reservation is **kept** (never released) so we
  fail safe toward *not* paying twice.

### V5 — Listen-tick earnings fraud  *(High)*
**Before:** `POST /api/listen-tick` fires for *every* visitor on play and is the
real earnings signal — a bot could POST it endlessly.
**Now:** Each visitor gets a **signed visitor cookie**; the server enforces a
**≥55 s minimum cadence**, a **per-visitor daily cap** and a **per-IP daily cap**,
all behind a per-IP rate limiter. Ticks that violate the rules return
`counted:false` instead of accruing. *Residual:* this throttles abuse but is not
cryptographic proof-of-listening — see **B1** for the economic caveat.

### V6 — HTTP hardening  *(Medium)*
Every response now carries `Content-Security-Policy` (scoped to the exact CDNs the
site uses), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy` (camera=self so the scanner works, else
denied), `Cross-Origin-Opener-Policy`, and `Strict-Transport-Security` when
`BEHIND_TLS=true`.

### V7 — Static-file safety  *(Medium)*
The static server normalizes the path and confirms it stays under the site root
(no `..` escape), refuses dotfiles (`.env`, `.git`) and the `server/` directory,
and never lists directories. Range requests are supported so large MP3s stream and
seek correctly.

### V8 / V9 — Rate limiting & body caps
Per-IP token buckets protect `login`, `withdraw`, `listen-tick`, `orders`, plus a
global API ceiling. JSON bodies are capped at 256 KB.

---

## 3. Residual risks — do before real money

| # | Risk | Sev | Recommendation |
|---|------|-----|----------------|
| **R4** | Live PayPal capture is not yet bound to a real payment — the `_xclick` redirect + "I've completed payment" is demo-grade. | **High** | Wire the PayPal **JS SDK** (`createOrder`/`onApprove` → `/api/orders/:id/capture`) or rely on the provided **webhook** (`/api/paypal/webhook`, signature-verified) before selling live. |
| R1 | CSP allows `'unsafe-inline'` for scripts because the pages use inline `onclick=` handlers. | Medium | Move handlers to `addEventListener`, then switch to a **nonce/hash CSP** and drop `unsafe-inline`. |
| R2 | Audio files are public static — a paid unlock gates the UI/download button, not the raw `audio/…mp3` URL. The 30-s preview is client-enforced only. | Medium | Serve paid tracks through an **authenticated, signed streaming endpoint** per order; generate real 30-s preview clips for the public path. |
| R3 | Ticket/merch prices come from the client (bounded 0–1000); only songs are server-priced. | Medium | Add a **server-side catalog** of events/merch so prices can't be tampered. |
| R5 | The server signing secret is auto-generated into `server/data/p2k.db`. | Medium | Ensure `server/data/` and `server/.env` are **never committed/backed up publicly** (already in `.gitignore`; the backup skill excludes them). Back up the SQLite file privately. |
| R7 | Rate-limit + anti-fraud state is in-memory / single-instance; `TRUST_PROXY` trusts `X-Forwarded-For`. | Low/Med | Behind multiple instances use a shared store; set `TRUST_PROXY=true` **only** behind a proxy you control (else IPs can be spoofed). |

---

## 4. Business-logic caveats (not code bugs)

- **B1 — Listen earnings are a *projection*, not received money.** The wallet
  balance mixes verified sales (real) with a configurable listen royalty
  (`LISTEN_RATE_PER_MIN`). If payouts move real funds, the listen portion is not
  backed by actual revenue. Decide: treat listen earnings as **display-only**
  (withdrawable = verified sales − payouts), or reconcile against **real** ad/
  streaming income before it counts toward a payout.
- **B2 — Payout destination.** Payouts target `p2key1@gmail.com`, the same address
  used to *receive* sales. A PayPal Payout from the business account to itself is a
  no-op. Confirm the intended personal-vs-business flow before enabling live payouts.
- **B3 — Rights / licensing.** Several catalog tracks appear to be other artists' or
  remixes (e.g. "Ketsa – Owned the Day", "DJ Meemx …", "dannyminus … Remix").
  Selling them for $16 and running ads requires P2K to actually own/license them.
  This is a legal matter, carried over from the prior review.

---

## 5. Deployment hardening checklist

1. `cp server/.env.example server/.env`, set **`P2K_ADMIN_PASSCODE`**, start once, restart.
2. Serve behind **HTTPS** and set `BEHIND_TLS=true` (Secure cookies + HSTS).
3. Set real **`PAYPAL_CLIENT_ID` / `PAYPAL_SECRET`**, `PAYPAL_ENV=production`, and
   `PAYPAL_WEBHOOK_ID`; complete the live-capture wiring (**R4**).
4. Set `TRUST_PROXY` correctly for your hosting.
5. Keep `server/.env` and `server/data/` **out of git/backups**; back up the SQLite DB privately.
6. Resolve **B1** and **B2** before enabling real payouts.
