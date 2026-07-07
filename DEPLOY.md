# Deploying p2k-music.ca

The site is a static front end **plus a required Node backend** (payments, tickets,
admin 2FA, wallet — all in `server/`, SQLite on disk). That means it needs a host that
runs a **persistent Node 22+ process with a persistent disk** — plain static hosting
(GitHub Pages / Netlify static) will NOT work.

> ⚠️ Never deploy `server/.env` or `server/data/` — secrets go into the host's
> environment-variable dashboard, and the database lives on the host's persistent disk.

## Environment variables for production

| Var | Value | Why |
|---|---|---|
| `BEHIND_TLS` | `true` | Host terminates HTTPS → Secure cookies + HSTS |
| `TRUST_PROXY` | `true` | Real client IPs from `X-Forwarded-For` (rate limits, anti-fraud) |
| `DATA_DIR` | `/data` (or the host's disk mount) | SQLite must live on the persistent disk |
| `ADMIN1_PASS` / `ADMIN2_PASS` | strong passwords | The two admin logins |
| `SMTP_USER` / `SMTP_PASS` | gmail + Google **App Password** | 2FA codes — **without this nobody can log in** (fail-closed) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | from developer.paypal.com (Live app) | Real payments; leave blank = demo mode |
| `PAYPAL_ENV` | `production` (`sandbox` to test) | Which PayPal API |
| `PAYPAL_WEBHOOK_ID` | from PayPal webhooks dashboard | Webhook signature verification |

## Option A — Render.com (recommended: simplest)

1. Push the repo to GitHub (already done: `p2k-music/p2k-music.com`).
2. render.com → **New → Blueprint** → connect the repo. Render reads
   [`render.yaml`](render.yaml): Node 22, 1 GB persistent disk at `/data`,
   health check on `/api/health`.
3. In the service's **Environment** tab fill in the secrets marked `sync: false`
   (admin passwords, SMTP, PayPal).
4. Deploy. Verify `https://<service>.onrender.com/api/health` returns `"ok":true`.
5. **Custom domain**: service → Settings → Custom Domains → add `p2k-music.ca` and
   `www.p2k-music.ca`, then create the CNAME/A records Render shows you at the domain
   registrar. HTTPS certificates are automatic.

Cost: the persistent disk requires a paid instance (~US$7/mo). Free tier has no disk —
the database (sales! tickets!) would be wiped on every deploy, so don't use it.

## Option B — Fly.io (cheap, uses the Dockerfile)

```sh
fly launch --no-deploy        # detects the Dockerfile; pick a region near Toronto (yyz)
fly volumes create p2k_data --size 1
# in fly.toml add:  [mounts]  source = "p2k_data"  destination = "/data"
fly secrets set ADMIN1_PASS=... ADMIN2_PASS=... SMTP_USER=... SMTP_PASS=... \
  PAYPAL_CLIENT_ID=... PAYPAL_SECRET=... PAYPAL_ENV=production BEHIND_TLS=true TRUST_PROXY=true
fly deploy
fly certs add p2k-music.ca && fly certs add www.p2k-music.ca   # then set DNS as shown
```

## Option C — Your own VPS / home server

1. Install Node 22+, clone the repo, `cp server/.env.example server/.env` and fill it in
   (`BEHIND_TLS=true`, `TRUST_PROXY=true`).
2. Run it as a service (systemd):
   ```ini
   [Unit]
   Description=p2k-music.ca
   After=network.target
   [Service]
   WorkingDirectory=/opt/p2k-music.com
   ExecStart=/usr/bin/node server/server.js
   Restart=always
   User=p2k
   [Install]
   WantedBy=multi-user.target
   ```
3. Put **Caddy** in front for automatic HTTPS (`Caddyfile`):
   ```
   p2k-music.ca, www.p2k-music.ca {
       reverse_proxy 127.0.0.1:8123
   }
   ```
4. Point the domain's A record at the server's IP.

Docker variant: `docker build -t p2k-music . && docker run -d --restart=always \
  -p 127.0.0.1:8123:8123 -v p2k-data:/data --env-file server/.env p2k-music`

## Post-deploy checklist

1. `GET /api/health` → `{"ok":true,"mode":"live",...}` (`mode:"demo"` means PayPal
   creds are missing/wrong).
2. Admin login works end-to-end (needs SMTP — codes arrive by email only).
3. Buy a track with PayPal **sandbox** creds first; confirm the revenue row appears in
   the admin wallet; then switch to live creds.
4. `GET /SERVER/data/p2k.db` returns **404** (static-server block list).
5. Backups: the SQLite DB is a single file (`$DATA_DIR/p2k.db`) — schedule a periodic
   copy off the host (it's your sales + ticket ledger).
