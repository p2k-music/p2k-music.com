# p2k-music.ca on Cloudflare Workers + D1

A faithful port of the Node backend (`server/`) to Cloudflare Workers, with the
same security model. The Node backend still works for local dev; this is the
edge-deployed production option. **Global, near-free, no server to run.**

## What maps to what

| Node (`server/`) | Worker (`worker/`) |
|---|---|
| `node:sqlite` file DB | **D1** (SQLite at the edge) — `schema.sql` |
| `http.createServer` | `export default { fetch, scheduled }` — `src/index.js` |
| scrypt password hash | **PBKDF2-HMAC-SHA256** via WebCrypto — `src/auth.js` |
| HMAC (crypto) sessions/CSRF/tickets | WebCrypto HMAC — same token format |
| in-memory rate-limit buckets | **D1 fixed-window** limiter (survives isolates) |
| SMTP over `node:tls` | SMTP over `cloudflare:sockets` — `src/email.js` |
| filesystem static server | **Workers Assets** (`env.ASSETS`) + `build-assets.mjs` |
| periodic prune `setInterval` | **cron trigger** → `scheduled()` |

Security parity verified on real workerd + D1: capture idempotency (no double
revenue), atomic withdrawal reservation (no overdraw), 2FA fail-closed login,
generic 401 (no user enumeration), CSRF-gated mutations, one-time ticket
check-in, CSP + security headers, `/SERVER/`·`/worker/`·`*.md` path blocking.

## Assets are staged, never the repo root

`build-assets.mjs` (run automatically by `[build]`) hardlinks **only git-tracked
public files** into `worker/public/`. The backend, git history, docs, secrets,
and untracked working-dir cruft are **never uploaded**. `worker/public/` is
git-ignored.

## Deploy

> **First time? Follow [`CLOUDFLARE-DEPLOY.md`](CLOUDFLARE-DEPLOY.md)** — a from-zero,
> copy-paste walkthrough for deploying to your own Cloudflare account. The condensed
> version:

```sh
cd worker

# 1) One-time: create YOUR D1, paste its id into wrangler.toml, apply the schema
wrangler d1 create p2k-music        # copy the database_id into wrangler.toml
wrangler d1 execute p2k-music --remote --file schema.sql

# 2) Secrets (NEVER commit these)
wrangler secret put SESSION_SECRET      # 48+ random hex — signs sessions/CSRF/tickets
wrangler secret put ADMIN1_PASS
wrangler secret put ADMIN2_PASS
wrangler secret put SMTP_USER           # gmail address
wrangler secret put SMTP_PASS           # Google App Password (2FA won't work without it)
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_SECRET
wrangler secret put PAYPAL_WEBHOOK_ID

# 3) Ship it
wrangler deploy
```

Non-secret vars (currency, price, PAYPAL_ENV=production, BEHIND_TLS) live in
`wrangler.toml [vars]`.

## Local dev

```sh
cd worker
wrangler d1 execute p2k-music --local --file schema.sql   # once
# put dev values in worker/.dev.vars (git-ignored):
#   SESSION_SECRET=dev...   ADMIN1_PASS=...   DEV_SHOW_CODE=1
wrangler dev --local
```

`DEV_SHOW_CODE=1` surfaces the 2FA code in the login response for local testing
(never set it in production — login is otherwise fail-closed).

## Custom domain (DNS on Cloudflare)

Workers → your worker → **Settings → Domains & Routes → Add custom domain** →
`p2k-music.ca` (and `www`). Cloudflare provisions the route + certificate
automatically since DNS is already on Cloudflare.

## Caveats

- **SMTP from Workers**: Cloudflare blocks outbound port 25 but allows 465/587.
  Gmail + App Password works from Workers; if a provider rejects Worker IPs,
  change `SMTP_HOST` or swap `src/email.js` for an HTTP email API (Resend, etc.).
- **Range requests** for audio are served by Cloudflare's asset edge in
  production (local `wrangler dev` may return the full file — cosmetic).
- **Backups**: D1 has time-travel/exports (`wrangler d1 export p2k-music`). The
  ledger is your sales + tickets — export it periodically.
- Event/merch prices are still client-supplied (residual risk R3), same as the
  Node backend — a server-side product catalog would close it.
