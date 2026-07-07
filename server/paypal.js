// ============================================================
//  p2k-music.ca — PayPal integration (Orders v2 + Payouts v1)
//  LIVE mode  : real REST calls when PAYPAL_CLIENT_ID/SECRET are set.
//  DEMO mode  : deterministic local simulation (no network, clearly labelled)
//               so the site is fully demonstrable without credentials.
// ============================================================
'use strict';
const crypto = require('crypto');
const config = require('./config');
const P = config.paypal;

const centsToStr = (c) => (c / 100).toFixed(2);

// ---- OAuth token cache (live) ------------------------------------------
let _token = null, _tokenExp = 0;
async function accessToken() {
  if (_token && Date.now() < _tokenExp - 60_000) return _token;
  const auth = Buffer.from(`${P.clientId}:${P.secret}`).toString('base64');
  const r = await fetch(`${P.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('paypal_oauth_failed_' + r.status);
  const j = await r.json();
  _token = j.access_token; _tokenExp = Date.now() + (j.expires_in || 3000) * 1000;
  return _token;
}
async function api(method, pathname, body) {
  const token = await accessToken();
  const r = await fetch(`${P.apiBase}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}

// ---- create order -------------------------------------------------------
async function createOrder({ amountCents, currency, description, returnUrl, cancelUrl }) {
  if (!P.live) {
    return { demo: true, paypalOrderId: 'DEMO-' + crypto.randomBytes(8).toString('hex').toUpperCase(), approveUrl: null };
  }
  const res = await api('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: currency, value: centsToStr(amountCents) },
      description: (description || 'p2k-music.ca').slice(0, 127),
    }],
    application_context: {
      brand_name: 'p2k-music.ca', user_action: 'PAY_NOW',
      return_url: returnUrl, cancel_url: cancelUrl,
    },
  });
  if (!res.ok) throw new Error('paypal_create_failed_' + res.status);
  const approve = (res.json.links || []).find((l) => l.rel === 'approve');
  return { demo: false, paypalOrderId: res.json.id, approveUrl: approve ? approve.href : null };
}

// ---- capture / verify order --------------------------------------------
async function captureOrder(paypalOrderId, expectCents, currency) {
  if (!P.live) {
    return { ok: true, demo: true, captureId: 'DEMO-CAP-' + crypto.randomBytes(6).toString('hex'), amountCents: expectCents, currency };
  }
  // capture; if already captured PayPal returns 422 ORDER_ALREADY_CAPTURED — treat as verify
  let res = await api('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {});
  if (!res.ok && res.status === 422) res = await api('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  if (!res.ok) return { ok: false, error: 'capture_failed_' + res.status };
  const pu = (res.json.purchase_units || [])[0] || {};
  const cap = ((pu.payments && pu.payments.captures) || [])[0] || {};
  const completed = res.json.status === 'COMPLETED' || cap.status === 'COMPLETED';
  const paidVal = cap.amount ? cap.amount.value : (pu.amount && pu.amount.value);
  const paidCents = Math.round(parseFloat(paidVal || '0') * 100);
  // Amount check: the buyer must have paid at least what we expected, same currency.
  const cur = (cap.amount && cap.amount.currency_code) || (pu.amount && pu.amount.currency_code);
  if (!completed) return { ok: false, error: 'not_completed' };
  // Fail closed: a response missing currency_code counts as a mismatch —
  // never accept an unverifiable currency on a money-unlocking path.
  if (expectCents != null && (paidCents < expectCents || (currency && cur !== currency))) {
    return { ok: false, error: 'amount_mismatch', paidCents, currency: cur };
  }
  return { ok: true, demo: false, captureId: cap.id, amountCents: paidCents, currency: cur };
}

// ---- payout (withdraw to P2K) ------------------------------------------
async function payout({ amountCents, currency, receiver, batchId, note }) {
  if (!P.live) {
    return { ok: true, demo: true, batchId, status: 'SUCCESS', paypalRef: 'DEMO-PO-' + crypto.randomBytes(6).toString('hex') };
  }
  const res = await api('POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: batchId, email_subject: 'Your p2k-music.ca payout' },
    items: [{
      recipient_type: 'EMAIL',
      amount: { value: centsToStr(amountCents), currency },
      receiver,
      note: note || 'p2k-music.ca earnings payout',
      sender_item_id: batchId,
    }],
  });
  if (!res.ok) return { ok: false, error: 'payout_failed_' + res.status, detail: res.json };
  const bh = res.json.batch_header || {};
  return { ok: true, demo: false, batchId, status: bh.batch_status || 'PENDING', paypalRef: bh.payout_batch_id };
}

// ---- webhook signature verification ------------------------------------
async function verifyWebhook(headers, rawBody) {
  if (!P.live || !P.webhookId) return { verified: false, reason: 'demo_or_unconfigured' };
  let event = {}; try { event = JSON.parse(rawBody); } catch (_) { return { verified: false, reason: 'bad_json' }; }
  const res = await api('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: P.webhookId,
    webhook_event: event,
  });
  return { verified: res.ok && res.json.verification_status === 'SUCCESS', event };
}

module.exports = { createOrder, captureOrder, payout, verifyWebhook, centsToStr };
