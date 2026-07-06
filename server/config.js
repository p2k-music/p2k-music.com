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
  dataDir: path.join(__dirname, 'data'),         // sqlite + runtime state
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
  // First run seeds the admin passcode hash from P2K_ADMIN_PASSCODE (preferred).
  // If unset, falls back to the legacy code so the demo works out-of-the-box —
  // the server logs a loud warning telling P2K to set a real one.
  seedPasscode: env.P2K_ADMIN_PASSCODE || '',
  legacyPasscode: '199430',
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
};

config.mode = config.paypal.live ? 'live' : 'demo';
module.exports = config;
