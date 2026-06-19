// Menuverso · read today's redemptions for a venue (partner live feed).
// Vercel Serverless Function (Node). GET /api/redemptions?venue=<slug>[&since=<ISO>]
//
// Returns an array of redemption rows for the venue since `since` (default: start
// of today UTC), newest first. Uses the service_role key server-side so the
// redemptions table stays inaccessible to the public client key.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const q = req.query || {};
    const venue = String(q.venue || '').trim().toLowerCase();
    if (!venue) { res.status(400).json({ error: 'venue_required' }); return; }
    let since = q.since ? new Date(q.since) : null;
    if (!since || isNaN(since.getTime())) { since = new Date(); since.setUTCHours(0, 0, 0, 0); }
    const url = SUPABASE_URL + '/rest/v1/redemptions'
      + '?select=id,venue_slug,member_id,member_name,deal_title,redeemed_at,acknowledged_at'
      + '&venue_slug=eq.' + encodeURIComponent(venue)
      + '&redeemed_at=gte.' + encodeURIComponent(since.toISOString())
      + '&order=redeemed_at.desc&limit=200';
    const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    if (!r.ok) { res.status(502).json({ error: 'query_failed' }); return; }
    const rows = await r.json().catch(() => []);
    // Short cache so the 3s poll doesn't hammer the DB but still feels live.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
