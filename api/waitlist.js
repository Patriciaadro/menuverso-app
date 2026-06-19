// Menuverso · waiting-list signup with double opt-in (GDPR/RGPD step 4).
// Vercel Serverless Function (Node). POST { email, consent }.
//
// Flow: validate -> upsert into launch_waitlist (double_opt_in_confirmed=false,
// consent fields + IP captured server-side) -> store a hashed token ->
// send a confirmation email via Resend with a unique link. The signup is saved
// even if the email send fails (best-effort), so a lead is never lost.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                 e.g. https://qjrqnnrucdvpwrbkxean.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase service role key (SERVER ONLY — never ship client-side)
//   RESEND_API_KEY               Resend API key (created after domain verification)
//
// COMPLIANCE-CRITICAL: never send marketing email to a row whose
// double_opt_in_confirmed is false. This function only sends the *confirmation*
// email (transactional), which is allowed pre-confirmation.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONSENT_VERSION = 'v1-june-2026';
// FROM must be an address on your Resend-verified domain.
const FROM = 'Menuverso <info@menuverso.com>';
const CONFIRM_BASE = 'https://menuverso.com/confirmar';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = String(body.email || '').trim().toLowerCase();
    const consent = body.consent === true || body.consent === 'true';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'invalid_email' }); return; }
    // GDPR Art. 6.1.a — server-side consent gate (audit trail). Do not remove.
    if (!consent) { res.status(400).json({ error: 'consent_required' }); return; }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || (req.socket && req.socket.remoteAddress) || null;

    const sb = (path, opts) => fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }
    }, opts));

    // Upsert the signup (merge on email so re-signup just refreshes consent).
    await sb('launch_waitlist?on_conflict=email', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, consented_at: new Date().toISOString(), consent_version: CONSENT_VERSION, ip_address: ip, double_opt_in_confirmed: false })
    });

    // One-time confirmation token (store only its hash; raw goes in the email).
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await sb('waitlist_confirmations', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ token_hash: tokenHash, email, expires_at: expiresAt })
    });

    // Send the confirmation email (best-effort — signup already persisted).
    const link = CONFIRM_BASE + '?token=' + token;
    let emailed = false;
    if (RESEND_API_KEY) {
      try {
        const er = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [email], subject: 'Confirma tu sitio en la lista de Menuverso', html: confirmationEmailHtml(link), text: confirmationEmailText(link) })
        });
        emailed = er.ok;
      } catch (e) { /* keep going; signup is saved */ }
    }
    res.status(200).json({ ok: true, emailed });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};

// ---- Confirmation email copy (Spanish primary, English fallback) ----
function confirmationEmailHtml(link) {
  return `<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,sans-serif;color:#1A1613;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:Anton,Impact,sans-serif;font-size:30px;letter-spacing:-.01em;text-transform:uppercase;color:#1A1613;">Casi dentro 🎉</div>
    <p style="font-size:16px;line-height:1.55;margin:18px 0 0;">¡Gracias por unirte a la lista de espera de <strong>Menuverso</strong>! Solo falta un paso: confirma tu email para reservar tu sitio y recibir acceso anticipado a las ofertas 2×1 en Barcelona.</p>
    <p style="margin:28px 0;">
      <a href="${link}" style="display:inline-block;background:#F4291A;color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:4px;">Confirmar mi email →</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">Si el botón no funciona, copia y pega este enlace:<br><a href="${link}" style="color:#C81C10;">${link}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:18px 0 0;">El enlace caduca en 48 horas. Si no te registraste, ignora este email.</p>
    <hr style="border:none;border-top:1px solid #E5DfD2;margin:24px 0;">
    <p style="font-size:12px;line-height:1.5;color:#8A8073;margin:0;"><strong>English:</strong> Thanks for joining the Menuverso waiting list. Confirm your email with the button above to save your spot. The link expires in 48 hours; if you didn't sign up, just ignore this message.</p>
  </div></body></html>`;
}
function confirmationEmailText(link) {
  return 'Confirma tu sitio en la lista de Menuverso.\n\nConfirma tu email: ' + link + '\n\nEl enlace caduca en 48 horas. Si no te registraste, ignora este email.\n\n(English) Confirm your spot on the Menuverso waiting list: ' + link;
}
