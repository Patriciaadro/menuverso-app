// Menuverso · member sign-up confirmation email (double opt-in).
// Vercel Serverless Function (Node). POST { email, name }
//
// On member sign-up the app calls this: it stores a one-time hashed token and
// emails the member a confirmation link (https://menuverso.com/confirmar?token=...).
// The /confirmar page calls /api/confirm, which verifies the token.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// (same trio as the waitlist; reuses the verified menuverso.com Resend domain.)

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'Menuverso <info@menuverso.com>';
const CONFIRM_BASE = 'https://menuverso.com/confirmar';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = String(body.email || '').trim().toLowerCase();
    const name = body.name ? String(body.name).slice(0, 80) : null;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'invalid_email' }); return; }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await fetch(SUPABASE_URL + '/rest/v1/member_confirmations', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ token_hash: tokenHash, email, name, expires_at: expiresAt })
    });

    let emailed = false;
    if (RESEND_API_KEY) {
      const link = CONFIRM_BASE + '?token=' + token;
      try {
        const er = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [email], subject: 'Confirma tu cuenta de Menuverso', html: confirmHtml(link, name), text: confirmText(link) })
        });
        emailed = er.ok;
      } catch (e) { /* token saved; member can still sign in (demo) */ }
    }
    res.status(200).json({ ok: true, emailed });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};

function confirmHtml(link, name) {
  return `<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,sans-serif;color:#1A1613;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:Anton,Impact,sans-serif;font-size:30px;text-transform:uppercase;color:#1A1613;">${name ? '¡Hola ' + name + '! 🎉' : 'Bienvenido 🎉'}</div>
    <p style="font-size:16px;line-height:1.55;margin:18px 0 0;">¡Gracias por crear tu cuenta en <strong>Menuverso</strong>! Confirma tu email para activar tu cuenta y empezar a canjear ofertas 2×1 en Barcelona.</p>
    <p style="margin:28px 0;"><a href="${link}" style="display:inline-block;background:#F4291A;color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:4px;">Confirmar mi cuenta →</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">Si el botón no funciona, copia y pega este enlace:<br><a href="${link}" style="color:#C81C10;">${link}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:18px 0 0;">El enlace caduca en 48 horas. Si no creaste esta cuenta, ignora este email.</p>
    <hr style="border:none;border-top:1px solid #E5DfD2;margin:24px 0;">
    <p style="font-size:12px;line-height:1.5;color:#8A8073;margin:0;"><strong>English:</strong> Thanks for creating your Menuverso account. Confirm your email with the button above. The link expires in 48 hours; if you didn't sign up, ignore this message.</p>
  </div></body></html>`;
}
function confirmText(link) {
  return 'Confirma tu cuenta de Menuverso: ' + link + '\n\nEl enlace caduca en 48 horas. Si no creaste esta cuenta, ignora este email.';
}
