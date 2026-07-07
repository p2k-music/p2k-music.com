// ============================================================
//  p2k-music.ca — PayPal (Orders v2 + Payouts v1) for Workers.
//  fetch()-based — identical logic to server/paypal.js. DEMO when creds absent.
// ============================================================

const centsToStr = (c) => (c / 100).toFixed(2);

// Per-request token cache would need Workers-scoped state; PayPal tokens are
// cheap to mint per operation here, so we fetch one when needed.
async function accessToken(P) {
  const auth = btoa(`${P.clientId}:${P.secret}`);
  const r = await fetch(`${P.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('paypal_oauth_failed_' + r.status);
  const j = await r.json();
  return j.access_token;
}
async function api(P, method, pathname, body) {
  const token = await accessToken(P);
  const r = await fetch(`${P.apiBase}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}

export async function createOrder(P, { amountCents, currency, description, returnUrl, cancelUrl }) {
  if (!P.live) return { demo: true, paypalOrderId: 'DEMO-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase(), approveUrl: null };
  const res = await api(P, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: currency, value: centsToStr(amountCents) }, description: (description || 'p2k-music.ca').slice(0, 127) }],
    application_context: { brand_name: 'p2k-music.ca', user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl },
  });
  if (!res.ok) throw new Error('paypal_create_failed_' + res.status);
  const approve = (res.json.links || []).find((l) => l.rel === 'approve');
  return { demo: false, paypalOrderId: res.json.id, approveUrl: approve ? approve.href : null };
}

export async function captureOrder(P, paypalOrderId, expectCents, currency) {
  if (!P.live) return { ok: true, demo: true, captureId: 'DEMO-CAP-' + crypto.randomUUID().slice(0, 12), amountCents: expectCents, currency };
  let res = await api(P, 'POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {});
  if (!res.ok && res.status === 422) res = await api(P, 'GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  if (!res.ok) return { ok: false, error: 'capture_failed_' + res.status };
  const pu = (res.json.purchase_units || [])[0] || {};
  const cap = ((pu.payments && pu.payments.captures) || [])[0] || {};
  const completed = res.json.status === 'COMPLETED' || cap.status === 'COMPLETED';
  const paidVal = cap.amount ? cap.amount.value : (pu.amount && pu.amount.value);
  const paidCents = Math.round(parseFloat(paidVal || '0') * 100);
  const cur = (cap.amount && cap.amount.currency_code) || (pu.amount && pu.amount.currency_code);
  if (!completed) return { ok: false, error: 'not_completed' };
  if (expectCents != null && (paidCents < expectCents || (currency && cur !== currency))) {
    return { ok: false, error: 'amount_mismatch', paidCents, currency: cur };
  }
  return { ok: true, demo: false, captureId: cap.id, amountCents: paidCents, currency: cur };
}

export async function payout(P, { amountCents, currency, receiver, batchId, note }) {
  if (!P.live) return { ok: true, demo: true, batchId, status: 'SUCCESS', paypalRef: 'DEMO-PO-' + crypto.randomUUID().slice(0, 12) };
  const res = await api(P, 'POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: batchId, email_subject: 'Your p2k-music.ca payout' },
    items: [{ recipient_type: 'EMAIL', amount: { value: centsToStr(amountCents), currency }, receiver, note: note || 'p2k-music.ca earnings payout', sender_item_id: batchId }],
  });
  if (!res.ok) return { ok: false, error: 'payout_failed_' + res.status, detail: res.json };
  const bh = res.json.batch_header || {};
  return { ok: true, demo: false, batchId, status: bh.batch_status || 'PENDING', paypalRef: bh.payout_batch_id };
}

export async function verifyWebhook(P, headers, rawBody) {
  if (!P.live || !P.webhookId) return { verified: false, reason: 'demo_or_unconfigured' };
  let event = {}; try { event = JSON.parse(rawBody); } catch (_) { return { verified: false, reason: 'bad_json' }; }
  const res = await api(P, 'POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
    webhook_id: P.webhookId,
    webhook_event: event,
  });
  return { verified: res.ok && res.json.verification_status === 'SUCCESS', event };
}
