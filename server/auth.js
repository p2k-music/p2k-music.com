// ============================================================
//  p2k-music.ca — auth & abuse-control primitives  (zero dependencies)
//  - Admin passcode: scrypt hash, timing-safe verify (no plaintext, ever)
//  - Sessions/visitors: HMAC-signed, tamper-proof, expiring cookie tokens
//  - CSRF: token bound to the session secret (double-submit header)
//  - Rate limiting: per-IP token buckets
// ============================================================
'use strict';
const crypto = require('crypto');
const config = require('./config');
const store = require('./db');

const SECRET = store.serverSecret();

// ---- passcode hashing (scrypt) -----------------------------------------
function hashPasscode(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pass), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPasscode(pass, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(pass), salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) { return false; }
}

// ---- signed token helpers (HMAC-SHA256) --------------------------------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(payloadObj) {
  const body = b64u(JSON.stringify(payloadObj));
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (_) { return null; }
}

// ---- sessions & visitors ------------------------------------------------
function issueAdminSession(adminEmail) {
  const now = Date.now();
  return sign({ r: 'admin', e: adminEmail || null, iat: now, exp: now + config.sessionTtlMs, n: crypto.randomBytes(8).toString('hex') });
}
function readAdminSession(token) {
  const o = verify(token);
  return o && o.r === 'admin' ? o : null;
}
function issueVisitor() {
  const now = Date.now();
  return sign({ v: crypto.randomBytes(12).toString('hex'), iat: now, exp: now + config.visitorTtlMs });
}
function readVisitor(token) {
  const o = verify(token);
  return o && o.v ? o : null;
}

// ---- CSRF: token derived from the session token, checked constant-time --
function csrfFor(sessionToken) {
  return crypto.createHmac('sha256', SECRET).update('csrf:' + String(sessionToken)).digest('base64url');
}
function csrfOk(sessionToken, presented) {
  if (!sessionToken || typeof presented !== 'string') return false;
  const expected = csrfFor(sessionToken);
  const a = Buffer.from(presented), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- ticket signatures (anti-forgery) ----------------------------------
function ticketSig(fields) {
  return crypto.createHmac('sha256', SECRET)
    .update(['t', fields.code, fields.event_id, fields.holder, fields.issued_at].join('|'))
    .digest('base64url');
}

// ---- rate limiter (per-IP token buckets) -------------------------------
const buckets = new Map();
function rateLimit(name, ip) {
  const spec = config.limits[name] || config.limits.api;
  const [max, refillPerSec] = spec;
  const key = name + ':' + ip;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: max, ts: now }; buckets.set(key, b); }
  b.tokens = Math.min(max, b.tokens + ((now - b.ts) / 1000) * refillPerSec);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
// periodic cleanup so the map can't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.ts > 3600_000) buckets.delete(k);
}, 600_000).unref();

module.exports = {
  hashPasscode, verifyPasscode,
  sign, verify, issueAdminSession, readAdminSession, issueVisitor, readVisitor,
  csrfFor, csrfOk, ticketSig, rateLimit,
};
