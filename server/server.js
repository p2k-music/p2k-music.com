// ============================================================
//  p2k-music.ca — backend server  (Node built-ins only, no npm installs)
//  Serves the static site + a secure JSON API:
//    admin auth · verified PayPal payments · anti-fraud listen wallet
//    · PayPal payouts · server-issued & cross-device-validated tickets
//  Run:  node server/server.js       Config: server/.env (see .env.example)
// ============================================================
'use strict';
const http = require('http');
const crypto = require('crypto');
const config = require('./config');
const H = require('./http');
const auth = require('./auth');
const store = require('./db');
const paypal = require('./paypal');
const email = require('./email');

const d = (cents) => Math.round(cents) / 100;              // cents → dollars
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const uid = () => crypto.randomUUID();

// ---- prepared statements ------------------------------------------------
const q = {
  insOrder: store.prepare(`INSERT INTO orders(id,kind,ref,title,amount_cents,currency,status,paypal_order_id,buyer_email,meta,created_at)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?)`),
  getOrder: store.prepare('SELECT * FROM orders WHERE id = ?'),
  payOrder: store.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=?"),
  setOrderPP: store.prepare('UPDATE orders SET paypal_order_id=? WHERE id=?'),
  insRevenue: store.prepare('INSERT INTO revenue(id,source,label,amount_cents,currency,order_id,created_at) VALUES(?,?,?,?,?,?,?)'),
  insTicket: store.prepare(`INSERT INTO tickets(code,order_id,event_id,event_title,event_date,venue,city,holder,email,price_cents,status,sig,issued_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  getTicket: store.prepare('SELECT * FROM tickets WHERE code = ?'),
  checkinTicket: store.prepare("UPDATE tickets SET status='checked-in', checked_in_at=? WHERE code=?"),
  insWithdrawal: store.prepare('INSERT INTO withdrawals(id,amount_cents,currency,status,batch_id,note,created_at) VALUES(?,?,?,?,?,?,?)'),
  updWithdrawal: store.prepare('UPDATE withdrawals SET status=?, paypal_ref=? WHERE id=?'),
  getVisitor: store.prepare('SELECT * FROM visitors WHERE id = ?'),
  insVisitor: store.prepare('INSERT INTO visitors(id,created_at,last_tick_at,day,day_count) VALUES(?,?,0,?,0)'),
  updVisitor: store.prepare('UPDATE visitors SET last_tick_at=?, day=?, day_count=? WHERE id=?'),
  getIpDay: store.prepare('SELECT count FROM ip_day WHERE ip=? AND day=?'),
  upsertIpDay: store.prepare('INSERT INTO ip_day(ip,day,count) VALUES(?,?,1) ON CONFLICT(ip,day) DO UPDATE SET count=count+1'),
  incListen: store.prepare("INSERT INTO kv(k,v) VALUES('listen_minutes','1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER)+1"),
  getAdmin: store.prepare('SELECT * FROM admins WHERE email = ?'),
  insAdmin: store.prepare('INSERT INTO admins(email,pass_hash,created_at) VALUES(?,?,?)'),
  setAdminLock: store.prepare('UPDATE admins SET fail_count=?, locked_until=? WHERE email=?'),
  insCode: store.prepare('INSERT INTO login_codes(id,email,code_hash,expires_at,attempts,used,created_at) VALUES(?,?,?,?,0,0,?)'),
  getCode: store.prepare('SELECT * FROM login_codes WHERE id = ?'),
  bumpCode: store.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?'),
  useCode: store.prepare('UPDATE login_codes SET used = 1 WHERE id = ?'),
};

// Seed the two admin accounts on first run. Passwords from config (env) if set,
// otherwise a strong one is generated and logged once (change it after).
function ensureAdminsSeed() {
  for (const a of config.admins) {
    if (!a.email || q.getAdmin.get(a.email)) continue;
    const pass = a.pass || crypto.randomBytes(6).toString('base64url');
    q.insAdmin.run(a.email, auth.hashPasscode(pass), Date.now());
    if (!a.pass) {
      console.warn(`\x1b[33m[SECURITY] Seeded admin ${a.email} with a generated password: ${pass}\n` +
        `  Set ADMIN1_PASS / ADMIN2_PASS in server/.env and reset server/data to choose your own.\x1b[0m`);
    } else {
      console.log(`  admin seeded: ${a.email}`);
    }
  }
}
ensureAdminsSeed();

const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
// Verify against this when an email is unknown, so timing doesn't reveal which emails exist.
const DUMMY_HASH = auth.hashPasscode(crypto.randomBytes(8).toString('hex'));
const isLoopback = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);

// ---- cookies ------------------------------------------------------------
function setCookie(res, name, value, maxAgeMs) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeMs) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (config.behindTLS) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : [parts.join('; ')]);
}
function clearCookie(res, name) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (config.behindTLS) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : [parts.join('; ')]);
}

function getAdmin(req) {
  const token = H.parseCookies(req)['p2k_s'];
  const s = token ? auth.readAdminSession(token) : null;
  return s ? { token, session: s } : null;
}
// Require an admin session; for unsafe methods also require a valid CSRF header.
function requireAdmin(req, res, needCsrf) {
  const a = getAdmin(req);
  if (!a) { H.sendJson(res, 401, { error: 'auth_required' }); return null; }
  if (needCsrf && !auth.csrfOk(a.token, req.headers['x-csrf-token'])) {
    H.sendJson(res, 403, { error: 'csrf' }); return null;
  }
  return a;
}
function getVisitorId(req, res) {
  const cookies = H.parseCookies(req);
  let v = auth.readVisitor(cookies['p2k_v']);
  if (!v) { const t = auth.issueVisitor(); setCookie(res, 'p2k_v', t, config.visitorTtlMs); v = auth.readVisitor(t); }
  return v.v;
}

// ---- validation helpers -------------------------------------------------
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 200) : '');

// ============================================================
//  API handlers
// ============================================================
async function handleApi(req, res, url) {
  const ip = H.clientIp(req);
  const p = url.pathname;
  const m = req.method;

  // global per-IP API ceiling
  if (!auth.rateLimit('api', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });

  // ---- health ----
  if (p === '/api/health' && m === 'GET') {
    return H.sendJson(res, 200, { ok: true, mode: config.mode, currency: config.currency });
  }

  // ---- admin auth ----
  // ---- admin auth step 1: email + password → email a one-time code ----
  if (p === '/api/admin/login' && m === 'POST') {
    if (!auth.rateLimit('login', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const body = await H.readJsonBody(req);
    if (body.error) return H.sendJson(res, 400, { error: body.error });
    const emailAddr = str(body.email, 160).trim().toLowerCase();
    const password = str(body.password, 200);
    const admin = emailAddr ? q.getAdmin.get(emailAddr) : null;
    const now = Date.now();

    // Account lockout after repeated wrong passwords
    if (admin && admin.locked_until && now < admin.locked_until) {
      return H.sendJson(res, 429, { ok: false, error: 'locked', retryInMin: Math.ceil((admin.locked_until - now) / 60000) });
    }
    // Always run one scrypt verify (real or dummy) so timing can't reveal which emails exist.
    const ok = auth.verifyPasscode(password, admin ? admin.pass_hash : DUMMY_HASH);
    if (!admin || !ok) {
      if (admin) {
        const fc = (admin.fail_count || 0) + 1;
        if (fc >= config.lockThreshold) q.setAdminLock.run(0, now + config.lockMinutes * 60000, emailAddr);
        else q.setAdminLock.run(fc, 0, emailAddr);
      }
      return H.sendJson(res, 401, { ok: false, error: 'invalid_credentials' });
    }
    if (admin.fail_count || admin.locked_until) q.setAdminLock.run(0, 0, emailAddr); // reset on success

    const challenge = uid();
    const code = genCode();
    q.insCode.run(challenge, emailAddr, auth.hashPasscode(code), now + config.codeTtlMs, now);

    // Deliver the code. FAIL CLOSED: it is only ever emailed to the real inbox.
    // The on-screen fallback is honoured ONLY for localhost dev (config.devShowCode),
    // so a remote attacker can never see the code even if the flag is left on.
    let surfaced = null;
    try {
      const r = await email.sendLoginCode(emailAddr, code);
      if (!r.sent) {
        if (config.devShowCode && isLoopback(ip)) { surfaced = code; console.log(`[2FA DEV] localhost code for ${emailAddr}: ${code}`); }
        else return H.sendJson(res, 503, { ok: false, error: 'email_not_configured' });
      }
    } catch (e) {
      console.warn('[2FA] email send failed:', e.message);
      return H.sendJson(res, 502, { ok: false, error: 'email_failed' });
    }
    return H.sendJson(res, 200, {
      ok: true, challenge, sentTo: email.maskEmail(emailAddr),
      demo: surfaced != null, demoCode: surfaced, // only ever set for a localhost dev session
    });
  }

  // ---- admin auth step 2: verify the emailed code → issue the session ----
  if (p === '/api/admin/verify' && m === 'POST') {
    if (!auth.rateLimit('login', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const body = await H.readJsonBody(req);
    if (body.error) return H.sendJson(res, 400, { error: body.error });
    const challenge = str(body.challenge, 64);
    const code = str(body.code, 12).trim();
    const row = q.getCode.get(challenge);
    if (!row || row.used || Date.now() > row.expires_at) return H.sendJson(res, 400, { ok: false, error: 'code_expired' });
    if (row.attempts >= config.codeMaxAttempts) { q.useCode.run(challenge); return H.sendJson(res, 429, { ok: false, error: 'too_many_attempts' }); }
    q.bumpCode.run(challenge);
    if (!auth.verifyPasscode(code, row.code_hash)) {
      return H.sendJson(res, 401, { ok: false, error: 'invalid_code', attemptsLeft: Math.max(0, config.codeMaxAttempts - (row.attempts + 1)) });
    }
    q.useCode.run(challenge);
    const token = auth.issueAdminSession(row.email);
    setCookie(res, 'p2k_s', token, config.sessionTtlMs);
    return H.sendJson(res, 200, { ok: true, csrf: auth.csrfFor(token), email: row.email });
  }
  if (p === '/api/admin/logout' && m === 'POST') {
    clearCookie(res, 'p2k_s');
    return H.sendJson(res, 200, { ok: true });
  }
  if (p === '/api/admin/session' && m === 'GET') {
    const a = getAdmin(req);
    return H.sendJson(res, 200, a ? { admin: true, csrf: auth.csrfFor(a.token), email: a.session.e || null, mode: config.mode } : { admin: false });
  }

  // ---- wallet: earnings (admin) ----
  if (p === '/api/earnings' && m === 'GET') {
    if (!requireAdmin(req, res, false)) return;
    const w = store.walletSummary();
    return H.sendJson(res, 200, {
      balance: d(w.balanceCents), paid: d(w.paidCents), earned: d(w.earnedCents),
      sales: d(w.salesCents), listen: d(w.listenCents), listenMinutes: w.listenMinutes,
      currency: config.currency, minWithdraw: config.minWithdraw, mode: config.mode,
    });
  }

  // ---- wallet: withdraw (admin + CSRF) ----
  if (p === '/api/withdraw' && m === 'POST') {
    if (!requireAdmin(req, res, true)) return;
    if (!auth.rateLimit('withdraw', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const body = await H.readJsonBody(req);
    if (body.error) return H.sendJson(res, 400, { error: body.error });
    const amount = Number(body.amount);
    if (!isNum(amount) || amount <= 0) return H.sendJson(res, 400, { success: false, error: 'invalid_amount' });
    if (amount < config.minWithdraw) return H.sendJson(res, 400, { success: false, error: `Minimum withdrawal is $${config.minWithdraw.toFixed(2)}` });
    const cents = Math.round(amount * 100);

    // Reserve the balance atomically (blocks concurrent double-withdraw).
    let reserved;
    try {
      reserved = store.tx(() => {
        const w = store.walletSummary();
        if (cents > w.balanceCents) return { error: 'insufficient' };
        const id = uid(), batchId = 'p2k-' + id.slice(0, 18);
        q.insWithdrawal.run(id, cents, config.currency, 'pending', batchId, 'earnings payout', Date.now());
        return { id, batchId };
      });
    } catch (e) { return H.sendJson(res, 500, { success: false, error: 'ledger_error' }); }
    if (reserved.error) return H.sendJson(res, 400, { success: false, error: 'Amount exceeds your balance' });

    // Execute payout (outside the tx). Failure → release; network error → keep reserved (safe).
    try {
      const out = await paypal.payout({
        amountCents: cents, currency: config.currency, receiver: config.payoutEmail,
        batchId: reserved.batchId, note: 'p2k-music.ca earnings payout',
      });
      if (out.ok) {
        const status = out.status === 'PENDING' ? 'pending' : 'completed';
        q.updWithdrawal.run(status, out.paypalRef || null, reserved.id);
        return H.sendJson(res, 200, { success: true, amount, batchId: reserved.batchId, status, demo: !!out.demo, mode: config.mode });
      }
      q.updWithdrawal.run('failed', null, reserved.id); // definitive rejection → release reservation
      return H.sendJson(res, 502, { success: false, error: out.error || 'payout_failed' });
    } catch (e) {
      // Unknown outcome: leave 'pending' (reserved) so we never double-pay; admin reconciles.
      return H.sendJson(res, 502, { success: false, error: 'payout_unconfirmed', batchId: reserved.batchId });
    }
  }

  // ---- public listen wallet tick (anti-fraud) ----
  if (p === '/api/listen-tick' && m === 'POST') {
    if (!auth.rateLimit('tick', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const vid = getVisitorId(req, res);
    const now = Date.now(), day = today();
    const result = store.tx(() => {
      let row = q.getVisitor.get(vid);
      if (!row) { q.insVisitor.run(vid, now, day); row = { last_tick_at: 0, day, day_count: 0 }; }
      if (now - row.last_tick_at < config.tickMinIntervalMs) return { counted: false, reason: 'too_soon' };
      let count = row.day === day ? row.day_count : 0;
      if (count >= config.tickDailyCapPerVisitor) return { counted: false, reason: 'daily_cap' };
      const ipRow = q.getIpDay.get(ip, day);
      if (ipRow && ipRow.count >= config.tickDailyCapPerIp) return { counted: false, reason: 'ip_cap' };
      q.incListen.run();
      q.updVisitor.run(now, day, count + 1, vid);
      q.upsertIpDay.run(ip, day);
      return { counted: true };
    });
    return H.sendJson(res, 200, Object.assign({ ok: true }, result));
  }

  // ---- create an order (server-priced songs; bounded ticket/merch) ----
  if (p === '/api/orders' && m === 'POST') {
    if (!auth.rateLimit('orders', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const body = await H.readJsonBody(req);
    if (body.error) return H.sendJson(res, 400, { error: body.error });
    const kind = str(body.kind, 12);
    if (!['song', 'ticket', 'merch'].includes(kind)) return H.sendJson(res, 400, { error: 'bad_kind' });

    let cents;
    if (kind === 'song') {
      cents = Math.round(config.songPrice * 100);          // server-authoritative price
    } else {
      const price = Number(body.price);                    // ticket/merch: bounded client price
      if (!isNum(price) || price < 0 || price > 1000) return H.sendJson(res, 400, { error: 'bad_price' });
      cents = Math.round(price * 100);
    }
    const id = uid();
    const meta = JSON.stringify({
      holder: str(body.holder, 120), email: str(body.email, 160),
      size: str(body.size, 12), qty: Math.max(1, Math.min(20, Number(body.qty) || 1)),
      eventId: str(body.ref, 64), eventTitle: str(body.title, 160),
      eventDate: str(body.eventDate, 40), venue: str(body.venue, 120), city: str(body.city, 80),
    });
    q.insOrder.run(id, kind, str(body.ref, 64), str(body.title, 160), cents, config.currency, 'created', null, str(body.email, 160), meta, Date.now());
    try {
      const order = await paypal.createOrder({
        amountCents: cents, currency: config.currency, description: str(body.title, 120) || 'p2k-music.ca',
        returnUrl: str(body.returnUrl, 300), cancelUrl: str(body.cancelUrl, 300),
      });
      q.setOrderPP.run(order.paypalOrderId, id);
      return H.sendJson(res, 200, {
        orderId: id, paypalOrderId: order.paypalOrderId, approveUrl: order.approveUrl,
        amount: d(cents), currency: config.currency, demo: !!order.demo, mode: config.mode,
      });
    } catch (e) { return H.sendJson(res, 502, { error: 'paypal_unavailable' }); }
  }

  // ---- capture / verify an order → grant unlock or issue ticket ----
  const capM = p.match(/^\/api\/orders\/([\w-]+)\/capture$/);
  if (capM && m === 'POST') {
    if (!auth.rateLimit('orders', ip)) return H.sendJson(res, 429, { error: 'rate_limited' });
    const order = q.getOrder.get(capM[1]);
    if (!order) return H.sendJson(res, 404, { error: 'no_order' });
    if (order.status === 'paid') return H.sendJson(res, 200, grantFor(order, ip)); // idempotent

    let cap;
    try { cap = await paypal.captureOrder(order.paypal_order_id, order.amount_cents, order.currency); }
    catch (e) { return H.sendJson(res, 502, { paid: false, error: 'paypal_unavailable' }); }
    if (!cap.ok) return H.sendJson(res, 402, { paid: false, error: cap.error || 'not_paid' });

    const grant = store.tx(() => {
      q.payOrder.run(Date.now(), order.id);
      q.insRevenue.run(uid(), order.kind, order.title || order.kind, order.amount_cents, order.currency, order.id, Date.now());
      return grantFor(order, ip);
    });
    return H.sendJson(res, 200, Object.assign({ paid: true, demo: !!cap.demo, mode: config.mode }, grant));
  }

  // ---- ticket lookup (public read, for the door scanner) ----
  const tGet = p.match(/^\/api\/ticket\/([\w-]+)$/);
  if (tGet && m === 'GET') {
    const t = q.getTicket.get(tGet[1]);
    if (!t) return H.sendJson(res, 404, { valid: false, reason: 'not_found' });
    const good = auth.ticketSig({ code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at }) === t.sig;
    return H.sendJson(res, 200, {
      valid: good && t.status !== 'void', status: t.status, forged: !good,
      event_title: t.event_title, event_date: t.event_date, venue: t.venue, city: t.city,
      holder: t.holder, price: d(t.price_cents), checked_in_at: t.checked_in_at,
    });
  }

  // ---- ticket check-in (admin + CSRF) ----
  const tChk = p.match(/^\/api\/ticket\/([\w-]+)\/checkin$/);
  if (tChk && m === 'POST') {
    if (!requireAdmin(req, res, true)) return;
    const t = q.getTicket.get(tChk[1]);
    if (!t) return H.sendJson(res, 404, { ok: false, reason: 'not_found' });
    const good = auth.ticketSig({ code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at }) === t.sig;
    if (!good) return H.sendJson(res, 200, { ok: false, reason: 'forged' });
    if (t.status === 'void') return H.sendJson(res, 200, { ok: false, reason: 'void' });
    if (t.status === 'checked-in') return H.sendJson(res, 200, { ok: false, alreadyUsed: true, checked_in_at: t.checked_in_at, holder: t.holder });
    q.checkinTicket.run(Date.now(), t.code);
    return H.sendJson(res, 200, { ok: true, holder: t.holder, event_title: t.event_title });
  }

  // ---- issue a ticket directly (admin only: comps / manual) ----
  if (p === '/api/tickets/issue' && m === 'POST') {
    if (!requireAdmin(req, res, true)) return;
    const body = await H.readJsonBody(req);
    if (body.error) return H.sendJson(res, 400, { error: body.error });
    const t = issueTicket({
      eventId: str(body.eventId, 64), eventTitle: str(body.eventTitle, 160), eventDate: str(body.eventDate, 40),
      venue: str(body.venue, 120), city: str(body.city, 80), holder: str(body.holder, 120),
      email: str(body.email, 160), priceCents: Math.round(Math.max(0, Number(body.price) || 0) * 100), orderId: null,
    });
    return H.sendJson(res, 200, { ok: true, ticket: t });
  }

  // ---- revenue summary (admin) ----
  if (p === '/api/revenue' && m === 'GET') {
    if (!requireAdmin(req, res, false)) return;
    const rows = store.prepare('SELECT source, COALESCE(SUM(amount_cents),0) AS c, COUNT(*) AS n FROM revenue GROUP BY source').all();
    const bySource = {}; let total = 0;
    for (const r of rows) { bySource[r.source] = { amount: d(r.c), count: r.n }; total += r.c; }
    const w = store.walletSummary();
    return H.sendJson(res, 200, { total: d(total), bySource, listen: d(w.listenCents), listenMinutes: w.listenMinutes, currency: config.currency });
  }

  // ---- PayPal webhook (reconciliation; verified in live mode) ----
  if (p === '/api/paypal/webhook' && m === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let vr; try { vr = await paypal.verifyWebhook(req.headers, raw); } catch (_) { vr = { verified: false }; }
    // In demo/unconfigured mode we acknowledge without trusting the event.
    return H.sendJson(res, 200, { received: true, verified: !!vr.verified });
  }

  return H.sendJson(res, 404, { error: 'not_found' });
}

// Build the "what the buyer gets" payload for a paid order.
function grantFor(order, ip) {
  if (order.kind === 'song') return { kind: 'song', songId: order.ref, title: order.title };
  if (order.kind === 'ticket') {
    const meta = safeMeta(order.meta);
    // reuse an already-issued ticket if capture is retried
    const existing = store.prepare('SELECT code FROM tickets WHERE order_id = ?').get(order.id);
    if (existing) { const t = q.getTicket.get(existing.code); return { kind: 'ticket', ticket: ticketView(t) }; }
    const t = issueTicket({
      eventId: meta.eventId || order.ref, eventTitle: meta.eventTitle || order.title, eventDate: meta.eventDate,
      venue: meta.venue, city: meta.city, holder: meta.holder, email: meta.email,
      priceCents: order.amount_cents, orderId: order.id,
    });
    return { kind: 'ticket', ticket: t };
  }
  return { kind: 'merch' };
}
function safeMeta(s) { try { return JSON.parse(s) || {}; } catch (_) { return {}; } }

function genTicketCode(seed) {
  const base = (String(seed || 'P2K').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()) || 'P2K';
  return 'P2K-' + base + '-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}
function issueTicket(f) {
  const issued_at = Date.now();
  let code = genTicketCode(f.city || f.eventTitle);
  while (q.getTicket.get(code)) code = genTicketCode(f.city || f.eventTitle); // collision guard
  const sig = auth.ticketSig({ code, event_id: f.eventId, holder: f.holder, issued_at });
  q.insTicket.run(code, f.orderId, f.eventId, f.eventTitle, f.eventDate, f.venue, f.city, f.holder, f.email, f.priceCents || 0, 'valid', sig, issued_at);
  return ticketView(q.getTicket.get(code));
}
function ticketView(t) {
  return {
    id: t.code, code: t.code, eventId: t.event_id, eventTitle: t.event_title, eventDate: t.event_date,
    venue: t.venue, city: t.city, holder: t.holder, email: t.email, price: d(t.price_cents),
    status: t.status, issuedAt: t.issued_at,
  };
}

// ---- /t/:code — public HTML validation page (the QR target) ----
function ticketPage(res, code) {
  const t = q.getTicket.get(code);
  let state, color, msg;
  if (!t) { state = 'INVALID'; color = '#ff6b6b'; msg = 'No ticket matches this code.'; }
  else {
    const good = auth.ticketSig({ code: t.code, event_id: t.event_id, holder: t.holder, issued_at: t.issued_at }) === t.sig;
    if (!good) { state = 'FORGED'; color = '#ff2d95'; msg = 'This ticket failed its security signature.'; }
    else if (t.status === 'checked-in') { state = 'ALREADY USED'; color = '#ffc439'; msg = 'Checked in ' + new Date(t.checked_in_at).toLocaleString(); }
    else if (t.status === 'void') { state = 'VOID'; color = '#ff6b6b'; msg = 'This ticket was voided.'; }
    else { state = 'VALID'; color = '#00d4ff'; msg = 'Admit one — show this at the door.'; }
  }
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = t ? `<div class="row"><b>${esc(t.event_title)}</b></div>
    <div class="row">${esc(t.event_date || '')}</div>
    <div class="row">${esc(t.city || '')}${t.venue ? ' — ' + esc(t.venue) : ''}</div>
    <div class="row">Holder: ${esc(t.holder || '—')}</div>
    <div class="code">${esc(t.code)}</div>` : `<div class="code">${esc(code)}</div>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ticket ${esc(code)} — p2k-music.ca</title>
    <style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#05060d;color:#eaf6ff;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1.5rem}
      .card{max-width:420px;width:100%;background:rgba(255,255,255,.05);border:1px solid ${color}55;border-radius:20px;
      padding:2rem;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)}
      .badge{display:inline-block;font-weight:800;letter-spacing:.05em;color:${color};border:2px solid ${color};
      border-radius:999px;padding:.5rem 1.4rem;font-size:1.3rem;margin-bottom:1rem}
      .row{color:rgba(234,246,255,.75);margin:.35rem 0}.row b{color:#fff;font-size:1.15rem}
      .code{margin-top:1.2rem;font-family:ui-monospace,monospace;letter-spacing:.08em;color:${color}}
      .brand{margin-top:1.5rem;font-size:.8rem;color:rgba(234,246,255,.4)}</style></head>
    <body><div class="card"><div class="badge">${state}</div><p class="row">${esc(msg)}</p>${body}
      <div class="brand">p2k-music.ca — verified ticket</div></div></body></html>`;
  H.securityHeaders(res, { html: true });
  res.writeHead(t ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ============================================================
//  request dispatch
// ============================================================
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const tm = url.pathname.match(/^\/t\/([\w-]+)\/?$/);
    if (tm && req.method === 'GET') return ticketPage(res, tm[1]);
    if (req.method === 'GET' || req.method === 'HEAD') return H.serveStatic(req, res);
    return H.sendText(res, 405, 'Method not allowed');
  } catch (e) {
    console.error('unhandled:', e);
    if (!res.headersSent) H.sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`\n  p2k-music.ca backend  ·  mode: ${config.mode.toUpperCase()}`);
  console.log(`  http://localhost:${config.port}  (serving ${config.rootDir})`);
  if (config.mode === 'demo') console.log('  PayPal DEMO mode — payments/payouts are simulated. Set PAYPAL_CLIENT_ID/SECRET for live.\n');
});
