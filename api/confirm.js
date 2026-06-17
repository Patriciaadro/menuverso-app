// Menuverso · double opt-in confirmation endpoint (GDPR/RGPD step 4).
// Vercel Serverless Function (Node). GET/POST ?token=...
//
// Verifies the token server-side, then flips Launch-waitlist.double_opt_in_confirmed
// to true (+ confirmed_at) and marks the token used. Idempotent: re-clicking a
// used token still reports success.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const token = String((req.query && req.query.token) || (req.body && req.body.token) || '').trim();
    if (!token) { res.status(400).json({ error: 'missing_token' }); return; }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const sb = (path, opts) => fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }
    }, opts));

    const r = await sb('waitlist_confirmations?select=email,expires_at,used_at&token_hash=eq.' + encodeURIComponent(tokenHash));
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) { res.status(404).json({ error: 'invalid' }); return; }
    if (row.used_at) { res.status(200).json({ ok: true, already: true }); return; }
    if (new Date(row.expires_at) < new Date()) { res.status(410).json({ error: 'expired' }); return; }

    const now = new Date().toISOString();
    await sb('Launch-waitlist?email=eq.' + encodeURIComponent(row.email), {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ double_opt_in_confirmed: true, confirmed_at: now })
    });
    await sb('waitlist_confirmations?token_hash=eq.' + encodeURIComponent(tokenHash), {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: now })
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
