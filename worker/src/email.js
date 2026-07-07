// ============================================================
//  p2k-music.ca — 2FA email sender for Workers.
//  Uses cloudflare:sockets to speak SMTP-over-TLS (port 465) to Gmail/any host,
//  mirroring server/email.js. Returns {sent:false} on any failure so login
//  stays FAIL-CLOSED (503) rather than leaking a code.
//
//  NOTE: Cloudflare blocks outbound port 25 but allows 465/587. Gmail with an
//  App Password works from Workers; if a provider rejects Worker IPs, switch
//  SMTP_HOST or use an HTTP email API (see worker/README.md).
// ============================================================
import { connect } from 'cloudflare:sockets';

export function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return s;
  const user = s.slice(0, at), dom = s.slice(at + 1);
  return (user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2)) + '***@' + dom;
}

function bareAddress(s) {
  const m = /<([^<>]+)>/.exec(String(s || ''));
  return (m ? m[1] : String(s || '')).trim();
}

async function smtpSend({ host, port, user, pass, from, to, subject, text }) {
  const socket = connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';

  const readReply = async () => {
    // Read until a final line "NNN " (space, not dash) appears.
    for (;;) {
      const nl = buf.indexOf('\r\n');
      if (nl !== -1) {
        const line = buf.slice(0, nl);
        if (/^\d{3} /.test(line)) { buf = buf.slice(nl + 2); return parseInt(line.slice(0, 3), 10); }
        buf = buf.slice(nl + 2);
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('smtp_closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  const write = (s) => writer.write(enc.encode(s));
  const b64 = (s) => btoa(s); // SMTP AUTH LOGIN user/pass are ASCII (Gmail App Password)

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('smtp_timeout')), ms))]);

  try {
    await withTimeout((async () => {
      let c = await readReply(); if (c !== 220) throw new Error('greeting ' + c);
      await write('EHLO p2k-music.ca\r\n'); c = await readReply(); if (c !== 250) throw new Error('ehlo ' + c);
      await write('AUTH LOGIN\r\n'); c = await readReply(); if (c !== 334) throw new Error('auth ' + c);
      await write(b64(user) + '\r\n'); c = await readReply(); if (c !== 334) throw new Error('user ' + c);
      await write(b64(pass) + '\r\n'); c = await readReply(); if (c !== 235) throw new Error('pass ' + c);
      await write(`MAIL FROM:<${bareAddress(from)}>\r\n`); c = await readReply(); if (c !== 250) throw new Error('from ' + c);
      await write(`RCPT TO:<${bareAddress(to)}>\r\n`); c = await readReply(); if (c !== 250 && c !== 251) throw new Error('rcpt ' + c);
      await write('DATA\r\n'); c = await readReply(); if (c !== 354) throw new Error('data ' + c);
      const msg = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n` +
                  `Content-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.\r\n`;
      await write(msg); c = await readReply(); if (c !== 250) throw new Error('body ' + c);
      await write('QUIT\r\n');
    })(), 15000);
  } finally {
    try { await writer.close(); } catch (_) {}
    try { await socket.close(); } catch (_) {}
  }
}

export async function sendLoginCode(cfg, toEmail, code) {
  if (!cfg.emailLive) return { sent: false, demo: true };
  const s = cfg.smtp;
  try {
    await smtpSend({
      host: s.host, port: s.port, user: s.user, pass: s.pass, from: s.from,
      to: toEmail, subject: 'Your p2k-music.ca admin login code',
      text: `Your one-time admin login code is: ${code}\n\nIt expires in ${Math.round(cfg.codeTtlMs / 60000)} minutes. If you didn't request it, ignore this email.`,
    });
    return { sent: true, demo: false };
  } catch (e) {
    console.warn('[2FA] smtp send failed:', e.message);
    return { sent: false, error: e.message };
  }
}
