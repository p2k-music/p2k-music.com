// ============================================================
//  p2k-music.ca — auth & abuse-control (Workers / WebCrypto)
//  - Passwords: PBKDF2-HMAC-SHA256 (scrypt isn't in WebCrypto), timing-safe verify
//  - Sessions / visitors / CSRF / tickets: HMAC-SHA256 signed tokens
//  - Rate limiting: D1 fixed-window (Node's in-memory buckets don't survive isolates)
// ============================================================

const PBKDF2_ITER = 100000;
const te = new TextEncoder();

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map((h) => parseInt(h, 16)));

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToStr(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(s + '==='.slice((s.length + 3) % 4));
}

// Constant-time string compare (both inputs already same-charset).
function timingEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- passwords (PBKDF2) -------------------------------------------------
async function pbkdf2(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', te.encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}
export async function hashPasscode(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pass, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${toHex(hash)}`;
}
export async function verifyPasscode(pass, stored) {
  try {
    const [alg, iterStr, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const actual = await pbkdf2(pass, fromHex(saltHex), parseInt(iterStr, 10));
    return timingEqual(toHex(actual), hashHex);
  } catch (_) { return false; }
}

// ---- HMAC-signed tokens -------------------------------------------------
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(msg));
  return b64url(new Uint8Array(sig));
}
async function sign(secret, payloadObj) {
  const body = b64url(te.encode(JSON.stringify(payloadObj)));
  const mac = await hmac(secret, body);
  return `${body}.${mac}`;
}
async function verify(secret, token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = await hmac(secret, body);
  if (!timingEqual(mac, expected)) return null;
  try {
    const obj = JSON.parse(b64urlToStr(body));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (_) { return null; }
}

const rnd = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

export async function issueAdminSession(secret, email, ttlMs) {
  const now = Date.now();
  return sign(secret, { r: 'admin', e: email || null, iat: now, exp: now + ttlMs, n: rnd(8) });
}
export async function readAdminSession(secret, token) {
  const o = await verify(secret, token);
  return o && o.r === 'admin' ? o : null;
}
export async function issueVisitor(secret, ttlMs) {
  const now = Date.now();
  return sign(secret, { v: rnd(12), iat: now, exp: now + ttlMs });
}
export async function readVisitor(secret, token) {
  const o = await verify(secret, token);
  return o && o.v ? o : null;
}

// CSRF: token derived from the session token, checked constant-time.
export async function csrfFor(secret, sessionToken) {
  return hmac(secret, 'csrf:' + String(sessionToken));
}
export async function csrfOk(secret, sessionToken, presented) {
  if (!sessionToken || typeof presented !== 'string') return false;
  return timingEqual(presented, await csrfFor(secret, sessionToken));
}

// Ticket anti-forgery signature (same field order as the Node backend).
export async function ticketSig(secret, f) {
  return hmac(secret, ['t', f.code, f.event_id, f.holder, f.issued_at].join('|'));
}

export function genCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}
export { rnd as randomHex };

// ---- D1 fixed-window rate limiter --------------------------------------
export async function rateLimit(DB, name, ip, spec) {
  const [max, windowSec] = spec;
  const k = name + ':' + ip;
  const now = Math.floor(Date.now() / 1000);
  const winStart = now - (now % windowSec);
  const row = await DB.prepare(
    `INSERT INTO rate_limits(k, count, window_start) VALUES(?, 1, ?)
     ON CONFLICT(k) DO UPDATE SET
       count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
     RETURNING count`
  ).bind(k, winStart, winStart, winStart, winStart).first();
  return (row ? row.count : 1) <= max;
}
