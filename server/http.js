// ============================================================
//  p2k-music.ca — HTTP helpers: security headers, body parsing,
//  and a hardened static file server (Range streaming + traversal guard).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

// Content-Security-Policy tuned to the exact hosts the site loads (fonts, FA,
// jsdelivr QR/jsQR, AdSense, PayPal). 'unsafe-inline' is required because the
// pages use inline onclick= handlers and style= attrs — see SECURITY-AUDIT.md.
function cspValue() {
  const p = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net " +
      "https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net " +
      "https://www.paypal.com https://*.paypal.com https://www.googletagservices.com https://*.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.paypal.com https://api-m.paypal.com https://api-m.sandbox.paypal.com " +
      "https://api.qrserver.com https://*.googlesyndication.com https://*.doubleclick.net",
    "frame-src https://www.paypal.com https://*.paypal.com https://*.googlesyndication.com " +
      "https://*.doubleclick.net https://googleads.g.doubleclick.net",
    "object-src 'none'", "base-uri 'self'",
    "form-action 'self' https://www.paypal.com",
    "frame-ancestors 'none'",
  ];
  if (config.behindTLS) p.push('upgrade-insecure-requests');
  return p.join('; ');
}
const CSP = cspValue();

function securityHeaders(res, { html = false } = {}) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // camera=self so the admin door-scanner (getUserMedia) works; deny the rest
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.behindTLS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (html) res.setHeader('Cache-Control', 'no-cache');
}

function clientIp(req) {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const val = part.slice(i + 1).trim();
    // Malformed %-encoding in a hostile cookie must not 500 the whole request.
    try { out[part.slice(0, i).trim()] = decodeURIComponent(val); }
    catch (_) { out[part.slice(0, i).trim()] = val; }
  }
  return out;
}

function sendJson(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  securityHeaders(res);
  // API responses carry session/CSRF/earnings state — never cacheable.
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function sendText(res, status, text, headers) {
  securityHeaders(res);
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
  res.end(text);
}

// Read + parse a JSON body with a hard size cap (DoS guard).
function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > config.bodyLimitBytes) { resolve({ error: 'payload_too_large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const ct = String(req.headers['content-type'] || '');
      const raw = Buffer.concat(chunks).toString('utf8');
      if (ct.includes('application/json') || raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          // Handlers do property access on the result — reject non-object payloads
          // (null / arrays / bare strings) instead of letting them 500 downstream.
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return resolve({ error: 'bad_json' });
          return resolve(parsed);
        } catch (_) { return resolve({ error: 'bad_json' }); }
      }
      resolve({ error: 'unsupported_type' });
    });
    req.on('error', () => resolve({ error: 'read_error' }));
  });
}

// Read a raw request body with a hard size cap (returns null when over-cap
// or on read error). Used where the exact bytes matter (webhook signatures).
function readRawBody(req, limitBytes) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

// Resolve a request path to a safe absolute file under rootDir (or null).
function resolveSafe(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch (_) { return null; }
  if (p === '/' || p === '') p = '/index.html';
  if (p.includes('\0')) return null;
  const abs = path.normalize(path.join(config.rootDir, p));
  const root = config.rootDir + path.sep;
  if (abs !== config.rootDir && !abs.startsWith(root)) return null; // escaped root
  return abs;
}

// Never serve the backend's own source/data or dotfiles over HTTP.
// Compared case-insensitively: Windows/macOS filesystems resolve /SERVER/… to
// the same directory, so a case-sensitive check would be a trivial bypass.
function isBlocked(abs) {
  const rel = path.relative(config.rootDir, abs).replace(/\\/g, '/').toLowerCase();
  if (rel.startsWith('server/') || rel === 'server') return true;
  if (rel.split('/').some((seg) => seg.startsWith('.'))) return true; // .git, .env, .claude, .project-memory…
  if (rel.endsWith('.md')) return true;                               // internal docs — never web-served
  return false;
}

function serveStatic(req, res) {
  let abs = resolveSafe(req.url);
  if (!abs) return sendText(res, 400, 'Bad request');
  if (isBlocked(abs)) return sendText(res, 404, 'Not found');

  let st;
  try { st = fs.statSync(abs); }
  catch (_) {
    // extensionless pretty URL → try <path>.html
    if (!path.extname(abs)) {
      try { const alt = abs + '.html'; fs.statSync(alt); abs = alt; st = fs.statSync(abs); }
      catch (_) { return notFound(res); }
    } else { return notFound(res); }
  }
  if (st.isDirectory()) {
    abs = path.join(abs, 'index.html');
    try { st = fs.statSync(abs); } catch (_) { return notFound(res); }
  }

  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  securityHeaders(res, { html: isHtml });
  res.setHeader('Content-Type', type);
  if (!isHtml) {
    const long = ['.mp3', '.mp4', '.wav', '.ogg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.svg', '.ico'];
    res.setHeader('Cache-Control', long.includes(ext) ? 'public, max-age=604800' : 'no-cache');
  }
  res.setHeader('Accept-Ranges', 'bytes');

  // Range request (audio/video seeking, large-file streaming)
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end = m[2] === '' ? null : parseInt(m[2], 10);
      if (start === null) { start = st.size - (end || 0); end = st.size - 1; }
      else if (end === null || end >= st.size) { end = st.size - 1; }
      if (start > end || start < 0 || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end();
      }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': (end - start + 1) });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(abs, { start, end }).on('error', () => res.end()).pipe(res);
    }
  }

  res.writeHead(200, { 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).on('error', () => res.end()).pipe(res);
}

function notFound(res) {
  const p = path.join(config.rootDir, '404.html');
  if (fs.existsSync(p)) {
    securityHeaders(res, { html: true });
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(p).pipe(res);
  }
  return sendText(res, 404, 'Not found');
}

module.exports = {
  securityHeaders, clientIp, parseCookies, sendJson, sendText,
  readJsonBody, readRawBody, serveStatic, MIME, CSP,
};
