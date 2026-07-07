// ============================================================
//  p2k-music.ca — Workers config (resolved per-request from env bindings)
//  Mirrors server/config.js. Secrets come from Wrangler secrets, never source.
// ============================================================

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));

export function makeConfig(env) {
  const paypalLive = !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET);
  const emailLive = !!(env.SMTP_USER && env.SMTP_PASS);
  return {
    currency: env.CURRENCY || 'CAD',
    songPrice: num(env.SONG_PRICE, 16),
    payoutEmail: env.PAYOUT_EMAIL || 'p2key1@gmail.com',
    minWithdraw: num(env.MIN_WITHDRAW, 1.55),
    listenRatePerMin: num(env.LISTEN_RATE_PER_MIN, 1.55 / 3),

    // Behind Cloudflare's edge we are always on HTTPS → Secure cookies + real client IP.
    behindTLS: bool(env.BEHIND_TLS, true),

    sessionTtlMs: num(env.SESSION_TTL_MIN, 240) * 60 * 1000,
    visitorTtlMs: num(env.VISITOR_TTL_MIN, 720) * 60 * 1000,

    tickMinIntervalMs: num(env.TICK_MIN_INTERVAL_MS, 55000),
    tickDailyCapPerVisitor: num(env.TICK_DAILY_CAP_VISITOR, 600),
    tickDailyCapPerIp: num(env.TICK_DAILY_CAP_IP, 1500),

    // Fixed-window rate limits: [maxRequests, windowSeconds]
    limits: {
      login: [8, 60],
      withdraw: [6, 120],
      tick: [30, 600],
      orders: [30, 60],
    },

    codeTtlMs: num(env.CODE_TTL_MIN, 5) * 60 * 1000,
    codeMaxAttempts: num(env.CODE_MAX_ATTEMPTS, 5),
    devShowCode: bool(env.DEV_SHOW_CODE, false),
    lockThreshold: num(env.LOCK_THRESHOLD, 8),
    lockMinutes: num(env.LOCK_MINUTES, 15),

    bodyLimitBytes: num(env.BODY_LIMIT_BYTES, 256 * 1024),

    admins: [
      { email: (env.ADMIN1_EMAIL || 'tajallatajalla2@gmail.com').toLowerCase(), pass: env.ADMIN1_PASS || '' },
      { email: (env.ADMIN2_EMAIL || 'aaron.styles9393@gmail.com').toLowerCase(), pass: env.ADMIN2_PASS || '' },
    ],

    paypal: {
      live: paypalLive,
      clientId: env.PAYPAL_CLIENT_ID || '',
      secret: env.PAYPAL_SECRET || '',
      apiBase: env.PAYPAL_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      webhookId: env.PAYPAL_WEBHOOK_ID || '',
    },

    smtp: {
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: num(env.SMTP_PORT, 465),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || env.SMTP_USER || 'p2k-music.ca <no-reply@p2k-music.ca>',
    },

    // Signing secret for sessions / CSRF / ticket HMACs. REQUIRED — set via
    //   wrangler secret put SESSION_SECRET
    // Fail closed if missing so we never sign with an empty/weak key.
    secret: env.SESSION_SECRET || '',
    emailLive,
    mode: paypalLive ? 'live' : 'demo',
  };
}
