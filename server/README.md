# p2k-music.ca — Backend

A **zero-dependency** Node server (Node 22+; uses the built-in `node:sqlite`).
It serves the static site **and** a secure JSON API for admin auth, PayPal
payments, the earnings wallet + payouts, and cross-device ticketing.

## Run

```bash
node server/server.js
```

Then open http://localhost:8123. First run creates `server/data/p2k.db` and
seeds config. With no PayPal credentials it runs in **DEMO mode** — payments and
payouts are simulated locally (and clearly labelled) so everything is testable.

## Configure

Copy `.env.example` → `server/.env` and edit. Highlights:

| Var | Meaning |
|-----|---------|
| `P2K_ADMIN_PASSCODE` | Your private admin passcode (scrypt-hashed on first run). |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | Set both to go **live** (else DEMO). |
| `PAYPAL_ENV` | `sandbox` (default) or `production`. |
| `SONG_PRICE`, `CURRENCY`, `MIN_WITHDRAW` | Catalog / payout settings. |
| `LISTEN_RATE_PER_MIN` | Projected streaming royalty per counted minute. |
| `BEHIND_TLS` | `true` when served over HTTPS (Secure cookies + HSTS). |

`server/.env` and `server/data/` are git-ignored — never commit them.

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET  /api/health` | — | mode + currency |
| `POST /api/admin/login` `{passcode}` | — | issue admin session (+CSRF) |
| `POST /api/admin/logout` | cookie | end session |
| `GET  /api/admin/session` | — | `{admin, csrf}` |
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
| `GET  /t/:code` | — | public ticket-status page (QR target) |

## Security

See [`../SECURITY-AUDIT.md`](../SECURITY-AUDIT.md) for the full posture, residual
risks, and the go-live checklist. Files: `config.js` (settings), `db.js`
(SQLite + wallet math), `auth.js` (scrypt, signed cookies, CSRF, rate limits),
`http.js` (headers + hardened static server), `paypal.js` (Orders/Payouts/webhook),
`server.js` (routing).
