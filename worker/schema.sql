-- ============================================================
--  p2k-music.ca — D1 schema (Cloudflare Workers backend)
--  Ported from server/db.js. Money is INTEGER CENTS everywhere.
--  Apply:  wrangler d1 execute p2k-music --file worker/schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,           -- song | ticket | merch
  ref          TEXT,
  title        TEXT,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL,           -- created | paid | failed | cancelled
  paypal_order_id TEXT,
  buyer_email  TEXT,
  meta         TEXT,
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER
);

CREATE TABLE IF NOT EXISTS tickets (
  code         TEXT PRIMARY KEY,
  order_id     TEXT,
  event_id     TEXT,
  event_title  TEXT,
  event_date   TEXT,
  venue        TEXT,
  city         TEXT,
  holder       TEXT,
  email        TEXT,
  price_cents  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,           -- valid | checked-in | void
  sig          TEXT NOT NULL,
  issued_at    INTEGER NOT NULL,
  checked_in_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);

CREATE TABLE IF NOT EXISTS revenue (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,           -- music | ticket | merch | manual | listen
  label        TEXT,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  order_id     TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL,           -- pending | completed | failed
  batch_id     TEXT,
  paypal_ref   TEXT,
  note         TEXT,
  created_at   INTEGER NOT NULL
);

-- Anti-fraud state for the public /api/listen-tick endpoint
CREATE TABLE IF NOT EXISTS visitors (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  last_tick_at INTEGER NOT NULL DEFAULT 0,
  day          TEXT,
  day_count    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ip_day (
  ip    TEXT NOT NULL,
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

-- Admin accounts (two logins) — password verified server-side (PBKDF2)
CREATE TABLE IF NOT EXISTS admins (
  email        TEXT PRIMARY KEY,
  pass_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- One-time 2FA login codes (emailed), hashed, short-lived, attempt-capped
CREATE TABLE IF NOT EXISTS login_codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Fixed-window rate limiting (replaces the Node in-memory token buckets, which
-- can't persist across ephemeral Worker isolates)
CREATE TABLE IF NOT EXISTS rate_limits (
  k            TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
