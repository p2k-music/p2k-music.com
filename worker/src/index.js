// ============================================================
//  p2k-music.ca — Cloudflare Worker (fetch + scheduled)
//  Ports server/server.js: static site + secure JSON API on D1.
//  Security parity: 2FA fail-closed, HMAC tickets, capture idempotency,
//  integer-cents money, no user enumeration, CSP + hardened static serving.
// ============================================================
import { makeConfig } from './config.js';
import * as auth from './auth.js';
import * as store from './db.js';
import * as paypal from './paypal.js';
import { sendLoginCode, maskEmail } from './email.js';

const d = store.d;
const uid = () => crypto.randomUUID();

// ---- security headers + CSP (mirror server/http.js) ---------------------
function cspValue() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://www.paypal.com https://*.paypal.com https://*.paypalobjects.com https://www.googletagservices.com https://*.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.paypal.com https://api-m.paypal.com https://api-m.sandbox.paypal.com https://*.paypalobjects.com https://api.qrserver.com https://*.googlesyndication.com https://*.doubleclick.net",
    "frame-src https://www.paypal.com https://*.paypal.com https://*.googlesyndication.com https://*.doubleclick.net https://googleads.g.doubleclick.net",
    "object-src 'none'", "base-uri 'self'", "form-action 'self' https://www.paypal.com", "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
const CSP = cspValue();

function baseHeaders(extra) {
  const h = new Headers(extra || {});
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self)');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return h;
}

function json(status, obj, cookies) {
  const h = baseHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of cookies || []) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(obj), { status, headers: h });
}
function text(status, body) {
  return new Response(body, { status, headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }) });
}

// ---- cookies ------------------------------------------------------------
function cookie(name, value, cfg, maxAgeMs) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeMs) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (cfg.behindTLS) parts.push('Secure');
  return parts.join('; ');
}
function clearCookie(name, cfg) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cfg.behindTLS) parts.push('Secure');
  return parts.join('; ');
}
function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const val = part.slice(i + 1).trim();
    try { out[part.slice(0, i).trim()] = decodeURIComponent(val); } catch (_) { out[part.slice(0, i).trim()] = val; }
  }
  return out;
}

const clientIp = (request) => request.headers.get('cf-connecting-ip') || '0.0.0.0';
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 200) : '');

async function readJson(request, limit) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > limit) return { error: 'payload_too_large' };
  let txt; try { txt = await request.text(); } catch (_) { return { error: 'read_error' }; }
  if (txt.length > limit) return { error: 'payload_too_large' };
  if (!txt) return {};
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json') || txt.trim().startsWith('{')) {
    try { const p = JSON.parse(txt); if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'bad_json' }; return p; }
    catch (_) { return { error: 'bad_json' }; }
  }
  return { error: 'unsupported_type' };
}

// ---- auth helpers -------------------------------------------------------
async function getAdminSession(request, cfg) {
  const token = parseCookies(request)['p2k_s'];
  const s = token ? await auth.readAdminSession(cfg.secret, token) : null;
  return s ? { token, session: s } : null;
}
async function requireAdmin(request, cfg, needCsrf) {
  const a = await getAdminSession(request, cfg);
  if (!a) return { error: json(401, { error: 'auth_required' }) };
  if (needCsrf && !(await auth.csrfOk(cfg.secret, a.token, request.headers.get('x-csrf-token')))) {
    return { error: json(403, { error: 'csrf' }) };
  }
  return { admin: a };
}

// ---- ticket helpers -----------------------------------------------------
function genTicketCode(seed) {
  const base = (String(seed || 'P2K').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()) || 'P2K';
  return 'P2K-' + base + '-' + auth.randomHex(4).toUpperCase().slice(0, 6);
}
function ticketView(t) {
  return { id: t.code, code: t.code, eventId: t.event_id, eventTitle: t.event_title, eventDate: t.event_date, venue: t.venue, city: t.city, holder: t.holder, email: t.email, price: d(t.price_cents), status: t.status, issuedAt: t.issued_at };
}
async function issueTicket(DB, cfg, f) {
  const issued_at = Date.now();
  let code = genTicketCode(f.city || f.eventTitle);
  while (await store.getTicket(DB, code)) code = genTicketCode(f.city || f.eventTitle);
  const sig = await auth.ticketSig(cfg.secret, { code, event_id: f.eventId, holder: f.holder, issued_at });
  await store.insTicket(DB, { code, order_id: f.orderId, event_id: f.eventId, event_title: f.eventTitle, event_date: f.eventDate, venue: f.venue, city: f.city, holder: f.holder, email: f.email, price_cents: f.priceCents || 0, sig, issued_at });
  return ticketView(await store.getTicket(DB, code));
}
function safeMeta(s) { try { return JSON.parse(s) || {}; } catch (_) { return {}; } }
async function grantFor(DB, cfg, order) {
  if (order.kind === 'song') return { kind: 'song', songId: order.ref, title: order.title };
  if (order.kind === 'ticket') {
    const existing = await store.getTicketByOrder(DB, order.id);
    if (existing) return { kind: 'ticket', ticket: ticketView(existing) };
    const m = safeMeta(order.meta);
    const t = await issueTicket(DB, cfg, { eventId: m.eventId || order.ref, eventTitle: m.eventTitle || order.title, eventDate: m.eventDate, venue: m.venue, city: m.city, holder: m.holder, email: m.email, priceCents: order.amount_cents, orderId: order.id });
    return { kind: 'ticket', ticket: t };
  }
  return { kind: 'merch' };
}

// ============================================================
//  API router
// ============================================================
async function handleApi(request, env, cfg, url) {
  const DB = env.DB;
  const ip = clientIp(request);
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/health' && m === 'GET') {
    let dbOk = true; try { await DB.prepare('SELECT 1 AS one').first(); } catch (_) { dbOk = false; }
    return json(dbOk ? 200 : 503, { ok: dbOk, mode: cfg.mode, currency: cfg.currency, emailConfigured: cfg.emailLive, edge: 'cloudflare-workers' });
  }
  if (p === '/api/config' && m === 'GET') {
    return json(200, { mode: cfg.mode, currency: cfg.currency, songPrice: cfg.songPrice, paypalClientId: cfg.paypal.live ? cfg.paypal.clientId : null });
  }

  // ---- admin login step 1 ----
  if (p === '/api/admin/login' && m === 'POST') {
    if (!(await auth.rateLimit(DB, 'login', ip, cfg.limits.login))) return json(429, { error: 'rate_limited' });
    const body = await readJson(request, cfg.bodyLimitBytes);
    if (body.error) return json(400, { error: body.error });
    const emailAddr = str(body.email, 160).trim().toLowerCase();
    const password = str(body.password, 200);
    // Make this admin's stored password match the current ADMIN*_PASS secret
    // (seeds the account on first login, adopts a rotated password thereafter).
    // No-op for non-admin emails, so it can't be used to probe which exist.
    if (emailAddr) await store.syncAdminPassword(DB, cfg, emailAddr, auth.hashPasscode, auth.sha256hex);
    const admin = emailAddr ? await store.getAdmin(DB, emailAddr) : null;
    const now = Date.now();
    const ok = await auth.verifyPasscode(password, admin ? admin.pass_hash : cfg._dummyHash);
    if (!admin || !ok) {
      if (admin) {
        const fc = (admin.fail_count || 0) + 1;
        if (fc >= cfg.lockThreshold) await store.setAdminLock(DB, 0, now + cfg.lockMinutes * 60000, emailAddr);
        else await store.setAdminLock(DB, fc, 0, emailAddr);
      }
      return json(401, { ok: false, error: 'invalid_credentials' });
    }
    if (admin.locked_until && now < admin.locked_until) return json(429, { ok: false, error: 'locked', retryInMin: Math.ceil((admin.locked_until - now) / 60000) });
    if (admin.fail_count || admin.locked_until) await store.setAdminLock(DB, 0, 0, emailAddr);

    const challenge = uid();
    const code = auth.genCode();
    await store.insCode(DB, challenge, emailAddr, await auth.hashPasscode(code), now + cfg.codeTtlMs);

    let surfaced = null;
    const r = await sendLoginCode(cfg, emailAddr, code);
    if (!r.sent) {
      if (cfg.devShowCode) surfaced = code;
      else return json(503, { ok: false, error: 'email_not_configured' });
    }
    return json(200, { ok: true, challenge, sentTo: maskEmail(emailAddr), demo: surfaced != null, demoCode: surfaced });
  }

  // ---- admin login step 2 ----
  if (p === '/api/admin/verify' && m === 'POST') {
    if (!(await auth.rateLimit(DB, 'login', ip, cfg.limits.login))) return json(429, { error: 'rate_limited' });
    const body = await readJson(request, cfg.bodyLimitBytes);
    if (body.error) return json(400, { error: body.error });
    const challenge = str(body.challenge, 64);
    const code = str(body.code, 12).trim();
    const row = await store.getCode(DB, challenge);
    if (!row || row.used || Date.now() > row.expires_at) return json(400, { ok: false, error: 'code_expired' });
    if (row.attempts >= cfg.codeMaxAttempts) { await store.useCode(DB, challenge); return json(429, { ok: false, error: 'too_many_attempts' }); }
    await store.bumpCode(DB, challenge);
    if (!(await auth.verifyPasscode(code, row.code_hash))) {
      return json(401, { ok: false, error: 'invalid_code', attemptsLeft: Math.max(0, cfg.codeMaxAttempts - (row.attempts + 1)) });
    }
    await store.useCode(DB, challenge);
    const token = await auth.issueAdminSession(cfg.secret, row.email, cfg.sessionTtlMs);
    return json(200, { ok: true, csrf: await auth.csrfFor(cfg.secret, token), email: row.email }, [cookie('p2k_s', token, cfg, cfg.sessionTtlMs)]);
  }
  if (p === '/api/admin/logout' && m === 'POST') return json(200, { ok: true }, [clearCookie('p2k_s', cfg)]);
  if (p === '/api/admin/session' && m === 'GET') {
    const a = await getAdminSession(request, cfg);
    return json(200, a ? { admin: true, csrf: await auth.csrfFor(cfg.secret, a.token), email: a.session.e || null, mode: cfg.mode } : { admin: false });
  }

  // ---- earnings (admin) ----
  if (p === '/api/earnings' && m === 'GET') {
    const g = await requireAdmin(request, cfg, false); if (g.error) return g.error;
    const w = await store.walletSummary(DB, cfg);
    return json(200, { balance: d(w.balanceCents), paid: d(w.paidCents), earned: d(w.earnedCents), sales: d(w.salesCents), listen: d(w.listenCents), listenMinutes: w.listenMinutes, currency: cfg.currency, minWithdraw: cfg.minWithdraw, mode: cfg.mode });
  }

  // ---- withdraw (admin + CSRF) ----
  if (p === '/api/withdraw' && m === 'POST') {
    const g = await requireAdmin(request, cfg, true); if (g.error) return g.error;
    if (!(await auth.rateLimit(DB, 'withdraw', ip, cfg.limits.withdraw))) return json(429, { error: 'rate_limited' });
    const body = await readJson(request, cfg.bodyLimitBytes);
    if (body.error) return json(400, { error: body.error });
    const amount = Number(body.amount);
    if (!isNum(amount) || amount <= 0) return json(400, { success: false, error: 'invalid_amount' });
    if (amount < cfg.minWithdraw) return json(400, { success: false, error: `Minimum withdrawal is $${cfg.minWithdraw.toFixed(2)}` });
    const cents = Math.round(amount * 100);
    const w = await store.walletSummary(DB, cfg);
    const id = uid(), batchId = 'p2k-' + id.slice(0, 18);
    const reserved = await store.reserveWithdrawal(DB, { id, cents, currency: cfg.currency, batchId, note: 'earnings payout', listenCents: w.listenCents });
    if (!reserved) return json(400, { success: false, error: 'Amount exceeds your balance' });
    try {
      const out = await paypal.payout(cfg.paypal, { amountCents: cents, currency: cfg.currency, receiver: cfg.payoutEmail, batchId, note: 'p2k-music.ca earnings payout' });
      if (out.ok) {
        const status = out.status === 'PENDING' ? 'pending' : 'completed';
        await store.updWithdrawal(DB, status, out.paypalRef || null, id);
        return json(200, { success: true, amount, batchId, status, demo: !!out.demo, mode: cfg.mode });
      }
      await store.updWithdrawal(DB, 'failed', null, id);
      return json(502, { success: false, error: out.error || 'payout_failed' });
    } catch (_) {
      return json(502, { success: false, error: 'payout_unconfirmed', batchId });
    }
  }

  // ---- listen tick ----
  if (p === '/api/listen-tick' && m === 'POST') {
    if (!(await auth.rateLimit(DB, 'tick', ip, cfg.limits.tick))) return json(429, { error: 'rate_limited' });
    const cookies = parseCookies(request);
    let v = await auth.readVisitor(cfg.secret, cookies['p2k_v']);
    if (!v) {
      const t = await auth.issueVisitor(cfg.secret, cfg.visitorTtlMs);
      return json(200, { ok: true, counted: false, reason: 'new_visitor' }, [cookie('p2k_v', t, cfg, cfg.visitorTtlMs)]);
    }
    const result = await store.listenTick(DB, cfg, v.v, ip);
    return json(200, Object.assign({ ok: true }, result));
  }

  // ---- create order ----
  if (p === '/api/orders' && m === 'POST') {
    if (!(await auth.rateLimit(DB, 'orders', ip, cfg.limits.orders))) return json(429, { error: 'rate_limited' });
    const body = await readJson(request, cfg.bodyLimitBytes);
    if (body.error) return json(400, { error: body.error });
    const kind = str(body.kind, 12);
    if (!['song', 'ticket', 'merch'].includes(kind)) return json(400, { error: 'bad_kind' });
    let cents;
    if (kind === 'song') cents = Math.round(cfg.songPrice * 100);
    else {
      const price = Number(body.price);
      if (!isNum(price) || price < 0 || price > 1000) return json(400, { error: 'bad_price' });
      cents = Math.round(price * 100);
    }
    const id = uid();
    const meta = JSON.stringify({ holder: str(body.holder, 120), email: str(body.email, 160), size: str(body.size, 12), qty: Math.max(1, Math.min(20, Number(body.qty) || 1)), eventId: str(body.ref, 64), eventTitle: str(body.title, 160), eventDate: str(body.eventDate, 40), venue: str(body.venue, 120), city: str(body.city, 80) });
    await store.insOrder(DB, { id, kind, ref: str(body.ref, 64), title: str(body.title, 160), amount_cents: cents, currency: cfg.currency, buyer_email: str(body.email, 160), meta });
    try {
      const order = await paypal.createOrder(cfg.paypal, { amountCents: cents, currency: cfg.currency, description: str(body.title, 120) || 'p2k-music.ca', returnUrl: str(body.returnUrl, 300), cancelUrl: str(body.cancelUrl, 300) });
      await store.setOrderPP(DB, order.paypalOrderId, id);
      return json(200, { orderId: id, paypalOrderId: order.paypalOrderId, approveUrl: order.approveUrl, amount: d(cents), currency: cfg.currency, demo: !!order.demo, mode: cfg.mode });
    } catch (_) { return json(502, { error: 'paypal_unavailable' }); }
  }

  // ---- capture ----
  const capM = p.match(/^\/api\/orders\/([\w-]+)\/capture$/);
  if (capM && m === 'POST') {
    if (!(await auth.rateLimit(DB, 'orders', ip, cfg.limits.orders))) return json(429, { error: 'rate_limited' });
    const order = await store.getOrder(DB, capM[1]);
    if (!order) return json(404, { error: 'no_order' });
    if (order.status === 'paid') return json(200, Object.assign({ paid: true, mode: cfg.mode }, await grantFor(DB, cfg, order)));
    let cap;
    if (order.kind === 'ticket' && order.amount_cents === 0) cap = { ok: true, demo: cfg.mode === 'demo' };
    else {
      try { cap = await paypal.captureOrder(cfg.paypal, order.paypal_order_id, order.amount_cents, order.currency); }
      catch (_) { return json(502, { paid: false, error: 'paypal_unavailable' }); }
    }
    if (!cap.ok) return json(402, { paid: false, error: cap.error || 'not_paid' });
    await store.captureGrant(DB, order);
    const fresh = await store.getOrder(DB, order.id);
    return json(200, Object.assign({ paid: true, demo: !!cap.demo, mode: cfg.mode }, await grantFor(DB, cfg, fresh)));
  }

  // ---- ticket lookup ----
  const tGet = p.match(/^\/api\/ticket\/([\w-]+)$/);
  if (tGet && m === 'GET') {
    const t = await store.getTicket(DB, tGet[1]);
    if (!t) return json(404, { valid: false, reason: 'not_found' });
    const good = (await auth.ticketSig(cfg.secret, { code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at })) === t.sig;
    return json(200, { valid: good && t.status !== 'void', status: t.status, forged: !good, event_title: t.event_title, event_date: t.event_date, venue: t.venue, city: t.city, holder: t.holder, price: d(t.price_cents), checked_in_at: t.checked_in_at });
  }

  // ---- ticket check-in (admin + CSRF) ----
  const tChk = p.match(/^\/api\/ticket\/([\w-]+)\/checkin$/);
  if (tChk && m === 'POST') {
    const g = await requireAdmin(request, cfg, true); if (g.error) return g.error;
    const t = await store.getTicket(DB, tChk[1]);
    if (!t) return json(404, { ok: false, reason: 'not_found' });
    const good = (await auth.ticketSig(cfg.secret, { code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at })) === t.sig;
    if (!good) return json(200, { ok: false, reason: 'forged' });
    if (t.status === 'void') return json(200, { ok: false, reason: 'void' });
    if (t.status === 'checked-in') return json(200, { ok: false, alreadyUsed: true, checked_in_at: t.checked_in_at, holder: t.holder });
    await store.checkinTicket(DB, t.code);
    return json(200, { ok: true, holder: t.holder, event_title: t.event_title });
  }

  // ---- issue ticket (admin + CSRF) ----
  if (p === '/api/tickets/issue' && m === 'POST') {
    const g = await requireAdmin(request, cfg, true); if (g.error) return g.error;
    const body = await readJson(request, cfg.bodyLimitBytes);
    if (body.error) return json(400, { error: body.error });
    const t = await issueTicket(DB, cfg, { eventId: str(body.eventId, 64), eventTitle: str(body.eventTitle, 160), eventDate: str(body.eventDate, 40), venue: str(body.venue, 120), city: str(body.city, 80), holder: str(body.holder, 120), email: str(body.email, 160), priceCents: Math.round(Math.max(0, Number(body.price) || 0) * 100), orderId: null });
    return json(200, { ok: true, ticket: t });
  }

  // ---- revenue (admin) ----
  if (p === '/api/revenue' && m === 'GET') {
    const g = await requireAdmin(request, cfg, false); if (g.error) return g.error;
    const rows = await store.revenueBySource(DB);
    const bySource = {}; let total = 0;
    for (const r of rows) { bySource[r.source] = { amount: d(r.c), count: r.n }; total += r.c; }
    const w = await store.walletSummary(DB, cfg);
    return json(200, { total: d(total), bySource, listen: d(w.listenCents), listenMinutes: w.listenMinutes, currency: cfg.currency });
  }

  // ---- PayPal webhook ----
  if (p === '/api/paypal/webhook' && m === 'POST') {
    const cl = Number(request.headers.get('content-length') || 0);
    if (cl > cfg.bodyLimitBytes) return json(413, { error: 'payload_too_large' });
    const raw = await request.text();
    if (raw.length > cfg.bodyLimitBytes) return json(413, { error: 'payload_too_large' });
    let vr; try { vr = await paypal.verifyWebhook(cfg.paypal, request.headers, raw); } catch (_) { vr = { verified: false }; }
    return json(200, { received: true, verified: !!vr.verified });
  }

  return json(404, { error: 'not_found' });
}

// ---- /t/:code public ticket page ----------------------------------------
function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function ticketPage(env, cfg, code) {
  const t = await store.getTicket(env.DB, code);
  let state, color, msg;
  if (!t) { state = 'INVALID'; color = '#ff6b6b'; msg = 'No ticket matches this code.'; }
  else {
    const good = (await auth.ticketSig(cfg.secret, { code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at })) === t.sig;
    if (!good) { state = 'FORGED'; color = '#ff2d95'; msg = 'This ticket failed its security signature.'; }
    else if (t.status === 'checked-in') { state = 'ALREADY USED'; color = '#ffc439'; msg = 'Checked in ' + new Date(t.checked_in_at).toLocaleString(); }
    else if (t.status === 'void') { state = 'VOID'; color = '#ff6b6b'; msg = 'This ticket was voided.'; }
    else { state = 'VALID'; color = '#00d4ff'; msg = 'Admit one — show this at the door.'; }
  }
  const body = t ? `<div class="row"><b>${esc(t.event_title)}</b></div><div class="row">${esc(t.event_date || '')}</div><div class="row">${esc(t.city || '')}${t.venue ? ' — ' + esc(t.venue) : ''}</div><div class="row">Holder: ${esc(t.holder || '—')}</div><div class="code">${esc(t.code)}</div>` : `<div class="code">${esc(code)}</div>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ticket ${esc(code)} — p2k-music.ca</title><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#05060d;color:#eaf6ff;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1.5rem}.card{max-width:420px;width:100%;background:rgba(255,255,255,.05);border:1px solid ${color}55;border-radius:20px;padding:2rem;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)}.badge{display:inline-block;font-weight:800;letter-spacing:.05em;color:${color};border:2px solid ${color};border-radius:999px;padding:.5rem 1.4rem;font-size:1.3rem;margin-bottom:1rem}.row{color:rgba(234,246,255,.75);margin:.35rem 0}.row b{color:#fff;font-size:1.15rem}.code{margin-top:1.2rem;font-family:ui-monospace,monospace;letter-spacing:.08em;color:${color}}.brand{margin-top:1.5rem;font-size:.8rem;color:rgba(234,246,255,.4)}</style></head><body><div class="card"><div class="badge">${state}</div><p class="row">${esc(msg)}</p>${body}<div class="brand">p2k-music.ca — verified ticket</div></div></body></html>`;
  return new Response(html, { status: t ? 200 : 404, headers: baseHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }) });
}

// ---- static blocking (defense in depth beyond .assetsignore) -------------
function isBlockedPath(pathname) {
  const rel = pathname.replace(/^\/+/, '').toLowerCase();
  if (rel === 'server' || rel.startsWith('server/')) return true;
  if (rel === 'worker' || rel.startsWith('worker/')) return true;
  if (rel.split('/').some((seg) => seg.startsWith('.'))) return true;
  if (rel.endsWith('.md')) return true;
  return false;
}
async function serveStatic(request, env) {
  const res = await env.ASSETS.fetch(request);
  const h = baseHeaders(res.headers);
  if ((res.headers.get('content-type') || '').includes('text/html')) h.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const cfg = makeConfig(env);
    if (!cfg.secret) return json(500, { error: 'server_misconfigured', detail: 'SESSION_SECRET not set' });
    cfg._dummyHash = env._DUMMY_HASH || (env._DUMMY_HASH = await auth.hashPasscode(auth.randomHex(8)));
    try {
      // Admin accounts are seeded/synced on demand inside the login handler
      // (see store.syncAdminPassword) — no fragile background seeding needed.
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, cfg, url);
      const tm = url.pathname.match(/^\/t\/([\w-]+)\/?$/);
      if (tm && request.method === 'GET') return await ticketPage(env, cfg, tm[1]);
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (isBlockedPath(url.pathname)) return text(404, 'Not found');
        return await serveStatic(request, env);
      }
      return text(405, 'Method not allowed');
    } catch (e) {
      console.error('unhandled:', e && e.stack || e);
      return json(500, { error: 'server_error' });
    }
  },

  // Retention pruning (configure a cron trigger in wrangler.toml)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(store.pruneExpired(env.DB));
  },
};
