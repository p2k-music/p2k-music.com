// ============================================================
//  p2k-music.ca — persistence layer  (Node built-in node:sqlite)
//  Money is stored as INTEGER CENTS everywhere to avoid float drift.
//  Source of truth for the wallet: verified revenue + counted listens − payouts.
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, 'p2k.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,           -- song | ticket | merch
    ref          TEXT,                    -- song id / event id / merch sku
    title        TEXT,
    amount_cents INTEGER NOT NULL,
    currency     TEXT NOT NULL,
    status       TEXT NOT NULL,           -- created | paid | failed | cancelled
    paypal_order_id TEXT,
    buyer_email  TEXT,
    meta         TEXT,                    -- JSON blob (ticket holder, size, qty…)
    created_at   INTEGER NOT NULL,
    paid_at      INTEGER
  );

  CREATE TABLE IF NOT EXISTS tickets (
    code         TEXT PRIMARY KEY,        -- P2K-XXX-XXXXXX
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
    sig          TEXT NOT NULL,           -- HMAC over code+event+holder (anti-forgery)
    issued_at    INTEGER NOT NULL,
    checked_in_at INTEGER
  );

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
    batch_id     TEXT,                    -- PayPal sender_batch_id (idempotency)
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

  -- Admin accounts (two logins) — password verified server-side (scrypt)
  CREATE TABLE IF NOT EXISTS admins (
    email        TEXT PRIMARY KEY,
    pass_hash    TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    fail_count   INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0
  );

  -- One-time 2FA login codes (emailed), hashed, short-lived, attempt-capped
  CREATE TABLE IF NOT EXISTS login_codes (
    id         TEXT PRIMARY KEY,        -- challenge id
    email      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

// Defensive migration: add lockout columns to admins DBs created before they existed
for (const col of ['fail_count', 'locked_until']) {
  try { db.exec(`ALTER TABLE admins ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); } catch (_) { /* already present */ }
}

// ---- kv helpers ---------------------------------------------------------
const _kvGet = db.prepare('SELECT v FROM kv WHERE k = ?');
const _kvSet = db.prepare('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
function kvGet(k) { const r = _kvGet.get(k); return r ? r.v : null; }
function kvSet(k, v) { _kvSet.run(k, String(v)); }

// A persistent, per-install signing secret (used for cookies, CSRF, ticket sigs).
function serverSecret() {
  let s = kvGet('server_secret');
  if (!s) { s = crypto.randomBytes(48).toString('hex'); kvSet('server_secret', s); }
  return s;
}

// ---- transactions -------------------------------------------------------
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

// ---- wallet math (all in cents) ----------------------------------------
const _sumRevenue = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS c FROM revenue');
const _sumPaid = db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS c FROM withdrawals WHERE status IN ('pending','completed')");
const _listenMin = db.prepare("SELECT v FROM kv WHERE k='listen_minutes'");

function listenMinutes() { const r = _listenMin.get(); return r ? Number(r.v) || 0 : 0; }
function listenEarningsCents() { return Math.round(listenMinutes() * config.listenRatePerMin * 100); }

function walletSummary() {
  const revenue = _sumRevenue.get().c;                 // verified sales (music/ticket/merch/manual)
  const listen = listenEarningsCents();                // projected streaming royalty
  const earned = revenue + listen;
  const paid = _sumPaid.get().c;                       // reserved (pending) + completed payouts
  const balance = Math.max(0, earned - paid);
  return {
    balanceCents: balance,
    paidCents: paid,
    earnedCents: earned,
    salesCents: revenue,
    listenCents: listen,
    listenMinutes: listenMinutes(),
  };
}

module.exports = {
  db, tx, kvGet, kvSet, serverSecret,
  walletSummary, listenMinutes,
  // prepared-statement factory so callers can build their own queries
  prepare: (sql) => db.prepare(sql),
};
