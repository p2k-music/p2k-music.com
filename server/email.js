// ============================================================
//  p2k-music.ca — email sender for 2FA login codes
//  LIVE: minimal SMTP-over-TLS client (zero dependencies) — works with
//        Gmail (smtp.gmail.com:465 + an App Password) or any SMTP host.
//  DEMO: when SMTP isn't configured, the caller surfaces the code instead
//        (clearly labelled) so the flow is testable without mail creds.
// ============================================================
'use strict';
const tls = require('node:tls');
const config = require('./config');

function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return s;
  const user = s.slice(0, at), dom = s.slice(at + 1);
  const shown = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return shown + '***@' + dom;
}

// "Name <addr@host>" → addr@host for the SMTP envelope (display names are
// valid in headers, but MAIL FROM/RCPT TO take the bare address only).
function bareAddress(s) {
  const m = /<([^<>]+)>/.exec(String(s || ''));
  return (m ? m[1] : String(s || '')).trim();
}

// Minimal SMTP/TLS conversation. Resolves on 250 after the message body.
function smtpSend({ host, port, user, pass, from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    socket.setEncoding('utf8');
    socket.setTimeout(15000);
    let buf = '';
    let waiter = null;
    let settled = false;
    const cleanup = () => { try { socket.end(); } catch (_) {} };
    const fail = (e) => { if (settled) return; settled = true; cleanup(); reject(e); };
    socket.on('timeout', () => fail(new Error('smtp_timeout')));
    socket.on('error', fail);
    // A clean server-side disconnect mid-conversation must not leave the
    // login request hanging on a waiter that will never be called.
    socket.on('close', () => fail(new Error('smtp_connection_closed')));
    socket.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length; i++) {
        if (/^\d{3} /.test(lines[i])) {                 // final line: "NNN text" (space, not dash)
          const code = parseInt(lines[i].slice(0, 3), 10);
          buf = lines.slice(i + 1).join('\r\n');
          if (waiter) { const w = waiter; waiter = null; w(code); }
          break;
        }
      }
    });
    const read = () => new Promise((res) => { waiter = res; });
    const b64 = (s) => Buffer.from(s).toString('base64');
    (async () => {
      let c = await read(); if (c !== 220) throw new Error('greeting ' + c);
      socket.write('EHLO p2k-music.ca\r\n'); c = await read(); if (c !== 250) throw new Error('ehlo ' + c);
      socket.write('AUTH LOGIN\r\n'); c = await read(); if (c !== 334) throw new Error('auth ' + c);
      socket.write(b64(user) + '\r\n'); c = await read(); if (c !== 334) throw new Error('user ' + c);
      socket.write(b64(pass) + '\r\n'); c = await read(); if (c !== 235) throw new Error('pass ' + c);
      socket.write(`MAIL FROM:<${bareAddress(from)}>\r\n`); c = await read(); if (c !== 250) throw new Error('from ' + c);
      socket.write(`RCPT TO:<${bareAddress(to)}>\r\n`); c = await read(); if (c !== 250 && c !== 251) throw new Error('rcpt ' + c);
      socket.write('DATA\r\n'); c = await read(); if (c !== 354) throw new Error('data ' + c);
      const msg =
        `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\n` +
        `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
        `${text}\r\n.\r\n`;
      socket.write(msg); c = await read(); if (c !== 250) throw new Error('body ' + c);
      socket.write('QUIT\r\n');
      settled = true;
      cleanup();
    })().then(resolve).catch(fail);
  });
}

// Send a login code. Returns {sent:true} in live mode, or {sent:false, demo:true}
// when SMTP isn't configured (caller then surfaces the code for demo testing).
async function sendLoginCode(toEmail, code) {
  if (!config.emailLive) return { sent: false, demo: true };
  const s = config.smtp;
  await smtpSend({
    host: s.host, port: s.port, user: s.user, pass: s.pass, from: s.from,
    to: toEmail, subject: 'Your p2k-music.ca admin login code',
    text: `Your one-time admin login code is: ${code}\n\nIt expires in ${Math.round(config.codeTtlMs / 60000)} minutes. If you didn't request it, ignore this email.`,
  });
  return { sent: true, demo: false };
}

module.exports = { sendLoginCode, maskEmail };
