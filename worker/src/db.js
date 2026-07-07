// ============================================================
//  p2k-music.ca — D1 data layer (Cloudflare Workers)
//  Money stays in INTEGER CENTS. Concurrency-critical mutations use single
//  conditional statements (D1 has no interactive BEGIN/COMMIT) so the checks
//  are atomic — see reserveWithdrawal() and captureGrant().
// ============================================================

export const d = (cents) => Math.round(cents) / 100;
export const today = () => new Date().toISOString().slice(0, 10);

// Seed the two admin accounts on first request (idempotent).
export async function ensureAdmins(DB, cfg, hashPasscode) {
  for (const a of cfg.admins) {
    if (!a.email) continue;
    const existing = await DB.prepare('SELECT email FROM admins WHERE email = ?').bind(a.email).first();
    if (existing) continue;
    if (!a.pass) { console.warn(`[SECURITY] admin ${a.email} has no ADMIN*_PASS set — cannot seed; set it as a secret.`); continue; }
    await DB.prepare('INSERT OR IGNORE INTO admins(email, pass_hash, created_at) VALUES(?, ?, ?)')
      .bind(a.email, await hashPasscode(a.pass), Date.now()).run();
  }
}

export async function getAdmin(DB, email) {
  return DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
}
export async function setAdminLock(DB, failCount, lockedUntil, email) {
  await DB.prepare('UPDATE admins SET fail_count=?, locked_until=? WHERE email=?').bind(failCount, lockedUntil, email).run();
}

// ---- login codes --------------------------------------------------------
export async function insCode(DB, id, email, codeHash, expiresAt) {
  await DB.prepare('INSERT INTO login_codes(id,email,code_hash,expires_at,attempts,used,created_at) VALUES(?,?,?,?,0,0,?)')
    .bind(id, email, codeHash, expiresAt, Date.now()).run();
}
export const getCode = (DB, id) => DB.prepare('SELECT * FROM login_codes WHERE id = ?').bind(id).first();
export const bumpCode = (DB, id) => DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').bind(id).run();
export const useCode = (DB, id) => DB.prepare('UPDATE login_codes SET used = 1 WHERE id = ?').bind(id).run();

// ---- orders / revenue ---------------------------------------------------
export async function insOrder(DB, o) {
  await DB.prepare(`INSERT INTO orders(id,kind,ref,title,amount_cents,currency,status,paypal_order_id,buyer_email,meta,created_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(o.id, o.kind, o.ref, o.title, o.amount_cents, o.currency, 'created', null, o.buyer_email, o.meta, Date.now()).run();
}
export const setOrderPP = (DB, ppId, id) => DB.prepare('UPDATE orders SET paypal_order_id=? WHERE id=?').bind(ppId, id).run();
export const getOrder = (DB, id) => DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();

// Atomically flip created→paid ONCE and record revenue only on the winning
// transition. Two racing captures: only one gets meta.changes===1.
export async function captureGrant(DB, order) {
  const now = Date.now();
  const upd = await DB.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status!='paid'").bind(now, order.id).run();
  if (upd.meta.changes === 1) {
    await DB.prepare('INSERT INTO revenue(id,source,label,amount_cents,currency,order_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), order.kind, order.title || order.kind, order.amount_cents, order.currency, order.id, now).run();
  }
}

// ---- tickets ------------------------------------------------------------
export const getTicket = (DB, code) => DB.prepare('SELECT * FROM tickets WHERE code = ?').bind(code).first();
export const getTicketByOrder = (DB, orderId) => DB.prepare('SELECT * FROM tickets WHERE order_id = ?').bind(orderId).first();
export async function insTicket(DB, t) {
  await DB.prepare(`INSERT INTO tickets(code,order_id,event_id,event_title,event_date,venue,city,holder,email,price_cents,status,sig,issued_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(t.code, t.order_id, t.event_id, t.event_title, t.event_date, t.venue, t.city, t.holder, t.email, t.price_cents || 0, 'valid', t.sig, t.issued_at).run();
}
export const checkinTicket = (DB, code) => DB.prepare("UPDATE tickets SET status='checked-in', checked_in_at=? WHERE code=?").bind(Date.now(), code).run();

// ---- wallet -------------------------------------------------------------
export async function listenMinutes(DB) {
  const r = await DB.prepare("SELECT v FROM kv WHERE k='listen_minutes'").first();
  return r ? Number(r.v) || 0 : 0;
}
export async function walletSummary(DB, cfg) {
  const revenue = (await DB.prepare('SELECT COALESCE(SUM(amount_cents),0) AS c FROM revenue').first()).c;
  const paid = (await DB.prepare("SELECT COALESCE(SUM(amount_cents),0) AS c FROM withdrawals WHERE status IN ('pending','completed')").first()).c;
  const minutes = await listenMinutes(DB);
  const listen = Math.round(minutes * cfg.listenRatePerMin * 100);
  const earned = revenue + listen;
  return { balanceCents: Math.max(0, earned - paid), paidCents: paid, earnedCents: earned, salesCents: revenue, listenCents: listen, listenMinutes: minutes };
}

// Atomic reservation: insert the pending withdrawal ONLY if the balance (incl.
// the JS-computed listen earnings, passed in) covers it. changes===1 ⇒ reserved.
export async function reserveWithdrawal(DB, { id, cents, currency, batchId, note, listenCents }) {
  const res = await DB.prepare(
    `INSERT INTO withdrawals(id,amount_cents,currency,status,batch_id,note,created_at)
     SELECT ?,?,?,'pending',?,?,?
     WHERE ? <= ( (SELECT COALESCE(SUM(amount_cents),0) FROM revenue) + ?
                  - (SELECT COALESCE(SUM(amount_cents),0) FROM withdrawals WHERE status IN ('pending','completed')) )`
  ).bind(id, cents, currency, batchId, note, Date.now(), cents, listenCents).run();
  return res.meta.changes === 1;
}
export const updWithdrawal = (DB, status, ref, id) => DB.prepare('UPDATE withdrawals SET status=?, paypal_ref=? WHERE id=?').bind(status, ref, id).run();

export async function insRevenue(DB, source, label, cents, currency, orderId) {
  await DB.prepare('INSERT INTO revenue(id,source,label,amount_cents,currency,order_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), source, label, cents, currency, orderId, Date.now()).run();
}
export async function revenueBySource(DB) {
  const { results } = await DB.prepare('SELECT source, COALESCE(SUM(amount_cents),0) AS c, COUNT(*) AS n FROM revenue GROUP BY source').all();
  return results || [];
}

// ---- listen tick (anti-fraud) ------------------------------------------
export async function listenTick(DB, cfg, vid, ip) {
  const now = Date.now(), day = today();
  let row = await DB.prepare('SELECT * FROM visitors WHERE id = ?').bind(vid).first();
  if (!row) {
    await DB.prepare('INSERT OR IGNORE INTO visitors(id,created_at,last_tick_at,day,day_count) VALUES(?,?,0,?,0)').bind(vid, now, day).run();
    row = { last_tick_at: 0, day, day_count: 0 };
  }
  if (now - row.last_tick_at < cfg.tickMinIntervalMs) return { counted: false, reason: 'too_soon' };
  const count = row.day === day ? row.day_count : 0;
  if (count >= cfg.tickDailyCapPerVisitor) return { counted: false, reason: 'daily_cap' };
  const ipRow = await DB.prepare('SELECT count FROM ip_day WHERE ip=? AND day=?').bind(ip, day).first();
  if (ipRow && ipRow.count >= cfg.tickDailyCapPerIp) return { counted: false, reason: 'ip_cap' };
  await DB.batch([
    DB.prepare("INSERT INTO kv(k,v) VALUES('listen_minutes','1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER)+1"),
    DB.prepare('UPDATE visitors SET last_tick_at=?, day=?, day_count=? WHERE id=?').bind(now, day, count + 1, vid),
    DB.prepare('INSERT INTO ip_day(ip,day,count) VALUES(?,?,1) ON CONFLICT(ip,day) DO UPDATE SET count=count+1').bind(ip, day),
  ]);
  return { counted: true };
}

// ---- retention prune (called from the scheduled handler) ----------------
export async function pruneExpired(DB) {
  const now = Date.now();
  const DAY = 86400000;
  await DB.batch([
    DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(now - 3600000),
    DB.prepare('DELETE FROM ip_day WHERE day < ?').bind(new Date(now - 2 * DAY).toISOString().slice(0, 10)),
    DB.prepare('DELETE FROM visitors WHERE last_tick_at < ? AND created_at < ?').bind(now - 90 * DAY, now - 90 * DAY),
    DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(now / 1000) - 86400),
  ]);
}
