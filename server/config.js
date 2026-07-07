// ============================================================
//  p2k-music.ca — backend configuration loader  (zero dependencies)
//  Reads server/.env (if present) + process.env, applies safe defaults.
//  NO secrets live in source. See .env.example.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

// ---- tiny .env parser (KEY=VALUE, # comments, quotes) -------------------
function loadDotEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val; // real env wins
    }
  } catch (_) { /* no .env file — fine, use defaults / real env */ }
}
loadDotEnv(path.join(__dirname, '.env'));

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(v));

// PayPal is "live" only when BOTH credentials are supplied; otherwise demo mode
// (fully functional locally — payments/payouts are simulated & clearly labelled).
const paypalLive = !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET);

const config = {
  // --- server ---
  port: num(env.PORT, 8123),
  host: env.HOST || '0.0.0.0',
  rootDir: path.resolve(__dirname, '..'),        // static site root (repo root)
  // sqlite + runtime state. Override with DATA_DIR on hosts where the persistent
  // disk mounts elsewhere (e.g. /data on Render/Fly) — else the DB dies on redeploy.
  dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(__dirname, 'data'),
  behindTLS: bool(env.BEHIND_TLS, false),        // set true when served over HTTPS (enables Secure cookies + HSTS)
  trustProxy: bool(env.TRUST_PROXY, false),      // honour X-Forwarded-For (only behind a trusted proxy)

  // --- money / catalog ---
  currency: env.CURRENCY || 'CAD',
  songPrice: num(env.SONG_PRICE, 16),
  payoutEmail: env.PAYOUT_EMAIL || 'p2key1@gmail.com',
  minWithdraw: num(env.MIN_WITHDRAW, 1.55),
  // Projected streaming royalty used by the listen wallet ($ per counted play-minute).
  // 1.55 / 3min == the client's original RATE. Configurable; see SECURITY-AUDIT.md caveats.
  listenRatePerMin: num(env.LISTEN_RATE_PER_MIN, 1.55 / 3),

  // --- admin auth ---
  sessionTtlMs: num(env.SESSION_TTL_MIN, 240) * 60 * 1000,   // 4h sliding
  visitorTtlMs: num(env.VISITOR_TTL_MIN, 720) * 60 * 1000,   // 12h

  // --- anti-fraud (listen ticks) ---
  tickMinIntervalMs: num(env.TICK_MIN_INTERVAL_MS, 55000),   // ≥55s between counted ticks per visitor
  tickDailyCapPerVisitor: num(env.TICK_DAILY_CAP_VISITOR, 600), // ≤600 min/day/visitor
  tickDailyCapPerIp: num(env.TICK_DAILY_CAP_IP, 1500),

  // --- rate limits (per IP) : [maxTokens, refillPerSec] ---
  limits: {
    login:  [8, 0.1],     // 8 burst, +1 every 10s
    withdraw: [6, 0.05],
    tick:   [30, 0.05],
    orders: [30, 0.2],
    api:    [240, 4],     // general API ceiling
  },

  // --- PayPal ---
  paypal: {
    live: paypalLive,
    clientId: env.PAYPAL_CLIENT_ID || '',
    secret: env.PAYPAL_SECRET || '',
    // sandbox vs production PayPal REST host
    apiBase: env.PAYPAL_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
    webhookId: env.PAYPAL_WEBHOOK_ID || '',
  },

  bodyLimitBytes: num(env.BODY_LIMIT_BYTES, 256 * 1024), // 256KB JSON cap
  logRequests: bool(env.LOG_REQUESTS, true),             // structured API/error request log

  // --- admin accounts (2 logins). Passwords via env, else generated + logged on first run ---
  admins: [
    { email: (env.ADMIN1_EMAIL || 'tajallatajalla2@gmail.com').toLowerCase(), pass: env.ADMIN1_PASS || '' },
    { email: (env.ADMIN2_EMAIL || 'aaron.styles9393@gmail.com').toLowerCase(), pass: env.ADMIN2_PASS || '' },
  ],

  // --- 2FA email codes ---
  codeTtlMs: num(env.CODE_TTL_MIN, 5) * 60 * 1000,   // one-time code lifetime
  codeMaxAttempts: num(env.CODE_MAX_ATTEMPTS, 5),
  // Surface the code on-screen instead of emailing it — ONLY honoured for
  // localhost requests, for local dev. Off by default → the system FAILS CLOSED
  // (no email configured = nobody can complete login). Never enable in production.
  devShowCode: bool(env.DEV_SHOW_CODE, false),

  // --- account lockout (brute-force defence, per admin) ---
  lockThreshold: num(env.LOCK_THRESHOLD, 8),   // wrong-password tries before lock
  lockMinutes: num(env.LOCK_MINUTES, 15),

  // --- SMTP for sending the code (blank = DEMO: code surfaced on screen instead) ---
  smtp: {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: num(env.SMTP_PORT, 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || 'p2k-music.ca <no-reply@p2k-music.ca>',
  },
};

config.mode = config.paypal.live ? 'live' : 'demo';
config.emailLive = !!(config.smtp.user && config.smtp.pass);

// ---- fail-fast validation: a misconfigured money site must not boot --------
(function validate(c) {
  const errs = [];
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) errs.push(`PORT must be 1-65535 (got ${c.port})`);
  if (!/^[A-Z]{3}$/.test(c.currency)) errs.push(`CURRENCY must be a 3-letter ISO code (got "${c.currency}")`);
  if (!(c.songPrice > 0)) errs.push(`SONG_PRICE must be > 0 (got ${c.songPrice})`);
  if (!(c.minWithdraw > 0)) errs.push(`MIN_WITHDRAW must be > 0 (got ${c.minWithdraw})`);
  if (!(c.listenRatePerMin >= 0)) errs.push(`LISTEN_RATE_PER_MIN must be >= 0 (got ${c.listenRatePerMin})`);
  if (!(c.bodyLimitBytes >= 1024)) errs.push(`BODY_LIMIT_BYTES must be >= 1024 (got ${c.bodyLimitBytes})`);
  if (env.PAYPAL_ENV === 'production' && !c.paypal.live) {
    // Not fatal — DEMO mode must keep working out of the box — but the owner
    // needs to know no real payments are happening despite the env setting.
    console.warn('\x1b[33m[CONFIG] PAYPAL_ENV=production but PAYPAL_CLIENT_ID/PAYPAL_SECRET are missing — running in DEMO mode (payments simulated).\x1b[0m');
  }
  if (errs.length) {
    console.error('\x1b[31m[CONFIG] Refusing to start — fix server/.env:\n  - ' + errs.join('\n  - ') + '\x1b[0m');
    process.exit(1);
  }
  if (c.behindTLS === false && c.mode === 'live') {
    console.warn('\x1b[33m[CONFIG] Live PayPal without BEHIND_TLS=true — cookies will not be Secure. Only OK behind a dev proxy.\x1b[0m');
  }
})(config);

module.exports = config;
