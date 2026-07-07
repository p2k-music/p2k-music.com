# Deploy p2k-music.ca to Cloudflare — step by step

This is a complete, from-zero walkthrough to put the site live on **your own**
Cloudflare account. No prior Cloudflare/Workers experience needed — just follow
each step and copy-paste the commands.

You'll end up with the whole site (music, tickets, merch, admin, wallet) running
on Cloudflare's global edge, backed by a Cloudflare D1 database. Cost: **free**
for normal traffic (Workers + D1 free tiers are generous).

> Everything you type is safe to run. Commands are for **Windows PowerShell**
> (what's on your PC). Where Mac/Linux differs, it's noted.

## Fastest path — the one-command script

If you'd rather not run each step by hand, there's a script that does the whole
thing (link account → create database → set secrets → deploy). From the project
folder in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File worker\deploy.ps1
```

It's safe to re-run — it only creates what's missing and only asks for secrets it
doesn't already have. It opens your browser once to link **your** Cloudflare
account, generates the signing key for you, and prompts for the admin/SMTP/PayPal
values. When it finishes it prints your live URL.

Prefer to understand each step (or the script hit a snag)? The manual walkthrough
below does exactly the same thing, one command at a time.

---

---

## Before you start — have these ready

1. **A Cloudflare account** — free. Sign up at <https://dash.cloudflare.com/sign-up>
   if you don't have one. (Your domain's DNS is already on Cloudflare, so you may
   already have an account — use that one.)
2. **Node.js 20+** installed — get it from <https://nodejs.org> (the "LTS" button).
   To check it's installed, open PowerShell and run: `node --version`
3. **The project folder** on your PC (the one with the `worker` folder inside it).
4. **Your secrets**, ready to paste when asked:
   - The two admin passwords you want (for `tajallatajalla2@gmail.com` and
     `aaron.styles9393@gmail.com`).
   - A **Gmail App Password** for sending login codes — *required*, or nobody can
     log into the admin (see the box in Step 6).
   - Your **PayPal** Client ID + Secret (from developer.paypal.com) — needed to
     take real payments. You can skip these at first and add them later; the site
     runs in a safe "demo mode" until they're set.

---

## Step 1 — Open a terminal in the project

Open **PowerShell**, then go into the project's `worker` folder. Replace the path
if yours is different:

```powershell
cd "$HOME\Downloads\p2k-Aaron-WEBSITE-help\worker"
```

Every command below is run from this `worker` folder.

## Step 2 — Install Wrangler (Cloudflare's tool)

```powershell
npm install -g wrangler
wrangler --version
```

If the second command prints a version number, you're good.

## Step 3 — Log in to YOUR Cloudflare

```powershell
wrangler login
```

This opens your browser. Click **Allow** to connect Wrangler to your Cloudflare
account. (This is *your* login — nothing from anyone else's account is used.)

To confirm it worked:

```powershell
wrangler whoami
```

It should show your Cloudflare email/account.

## Step 4 — Create your database and connect it

Create the D1 database in your account:

```powershell
wrangler d1 create p2k-music
```

It prints a block that ends with a line like:

```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy that whole `database_id` value.** Now open the file `worker\wrangler.toml`
in a text editor (Notepad is fine), find this line:

```
database_id = "PASTE_YOUR_D1_DATABASE_ID_HERE"
```

…and replace `PASTE_YOUR_D1_DATABASE_ID_HERE` with the id you copied. Save the file.

## Step 5 — Create the database tables

```powershell
wrangler d1 execute p2k-music --remote --file schema.sql
```

This builds all the tables (orders, tickets, revenue, admins, etc.) in your D1.
You only do this once.

## Step 6 — Set your secrets

Secrets are stored encrypted in Cloudflare — never in the code. Run each command,
and paste the value when it prompts you.

First, the **signing key** (protects logins, tickets, and payments). Generate a
random one and set it:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the long string it prints, then:

```powershell
wrangler secret put SESSION_SECRET
```

…and paste that string when prompted. Then set the rest, one at a time:

```powershell
wrangler secret put ADMIN1_PASS        # password for tajallatajalla2@gmail.com
wrangler secret put ADMIN2_PASS        # password for aaron.styles9393@gmail.com
wrangler secret put SMTP_USER          # your Gmail address (sends login codes)
wrangler secret put SMTP_PASS          # your Gmail APP PASSWORD (see box below)
```

> **Gmail App Password (needed for admin login):** the admin login emails you a
> 6-digit code, and it will not work without this. In your Google Account →
> **Security** → turn on **2-Step Verification**, then open **App passwords**,
> create one named "p2k-music", and copy the 16-character password. Use that as
> `SMTP_PASS` (not your normal Gmail password). Until this is set, the admin login
> is intentionally locked for everyone.

To take **real payments**, also set your PayPal keys (skip for now if you want to
test first — the site runs in demo mode until both are set):

```powershell
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_SECRET
wrangler secret put PAYPAL_WEBHOOK_ID   # optional, from PayPal's Webhooks page
```

## Step 7 — Deploy 🚀

```powershell
wrangler deploy
```

This bundles the site and pushes it live. When it finishes it prints your live
URL, something like:

```
https://p2k-music.<your-subdomain>.workers.dev
```

Open that URL in your browser — the site is live.

## Step 8 — Quick check it's healthy

In your browser, visit that URL with `/api/health` on the end, e.g.
`https://p2k-music.<your-subdomain>.workers.dev/api/health`

You should see: `{"ok":true,"mode":"demo",...}` (or `"mode":"live"` once PayPal
keys are set). If you see `"mode":"demo"`, payments are simulated — add the PayPal
secrets (Step 6) and run `wrangler deploy` again to go live.

## Step 9 — Put it on p2k-music.ca

1. In the Cloudflare dashboard: **Workers & Pages** → click your **p2k-music**
   worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain**.
2. Enter `p2k-music.ca`. Add it again for `www.p2k-music.ca`.
3. Because your DNS is already on Cloudflare, it wires up the records and the HTTPS
   certificate automatically — no registrar changes needed.

Give it a couple of minutes, then visit **https://p2k-music.ca**. Done. 🎉

---

## Everyday tasks (after it's live)

- **Publish a change:** re-run `wrangler deploy` from the `worker` folder.
- **See live logs / errors:** `wrangler tail` (streams what the site is doing).
- **Back up your data** (sales + tickets ledger — do this regularly):
  `wrangler d1 export p2k-music --remote --output backup.sql`
- **Change a secret:** just `wrangler secret put NAME` again with the new value,
  then `wrangler deploy`.

## If something goes wrong

| Symptom | Fix |
|---|---|
| `wrangler: command not found` | Re-run `npm install -g wrangler`; reopen PowerShell. |
| Deploy error mentioning `database_id` | You didn't paste your real id into `wrangler.toml` (Step 4). |
| Health shows `"mode":"demo"` | PayPal secrets not set — add them (Step 6) + redeploy. |
| Admin login says code can't be sent | `SMTP_USER`/`SMTP_PASS` not set, or `SMTP_PASS` isn't a Gmail **App Password**. |
| Can't log in even with the right password | That's by design until SMTP is set — the code is only ever emailed. |

Full technical detail (how the pieces map, security model, caveats) is in
[`README.md`](README.md).
