// Menuverso · record a redemption (member slide-to-confirm → partner live feed).
// Vercel Serverless Function (Node). POST { venueSlug, memberId?, memberName?, dealTitle?, redeemedAt? }
//
// Writes one row to public.redemptions using the service_role key (server-side
// only). The partner "Canjes en vivo" feed reads it back via /api/redemptions.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const venueSlug = String(body.venueSlug || '').trim().toLowerCase();
    if (!venueSlug) { res.status(400).json({ error: 'venue_required' }); return; }
    const row = {
      venue_slug: venueSlug,
      member_id: body.memberId ? String(body.memberId).slice(0, 80) : null,
      member_name: body.memberName ? String(body.memberName).slice(0, 120) : null,
      deal_title: body.dealTitle ? String(body.dealTitle).slice(0, 160) : null,
      redeemed_at: body.redeemedAt ? new Date(body.redeemedAt).toISOString() : new Date().toISOString()
    };
    const r = await fetch(SUPABASE_URL + '/rest/v1/redemptions', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    if (!r.ok) { res.status(502).json({ error: 'insert_failed' }); return; }
    const out = await r.json().catch(() => null);
    res.status(200).json({ ok: true, id: (Array.isArray(out) && out[0] && out[0].id) || null });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
