// Menuverso · a member's redemption history, for cross-device sync (QA item 5).
// Vercel Serverless Function (Node). GET /api/member-redemptions?member=<id>
//
// The app calls this after sign-in and on boot with a live session, then
// merges the rows into store.redemptions so Profile (Visitas, Guardado),
// Reservas and memberSavingsEur() show visits made on the member's other
// devices. Service-role read: public.redemptions has RLS on and no anon
// policies, so the publishable key can never read it directly.
//
// KNOWN LIMITATION until real auth (QA item 6): the member id is the only
// credential. Local member ids are 'u_' + 10 random base36 chars (~52 bits),
// not guessable, but they are not secret either (the public partner feed
// /api/redemptions returns member_id). Once members sign in with Supabase
// Auth, require their access token here and read the id from the JWT
// instead of the query string.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEMBER_ID_RE = /^[A-Za-z0-9_-]{4,80}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const member = String((req.query && req.query.member) || '').trim();
    // Strict charset also keeps PostgREST filter syntax out of the query.
    if (!MEMBER_ID_RE.test(member)) { res.status(400).json({ error: 'member_required' }); return; }
    const url = SUPABASE_URL + '/rest/v1/redemptions'
      + '?select=id,venue_slug,deal_id,deal_title,redeemed_at'
      + '&member_id=eq.' + encodeURIComponent(member)
      + '&order=redeemed_at.desc&limit=500';
    const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    if (!r.ok) { res.status(502).json({ error: 'query_failed' }); return; }
    const rows = await r.json().catch(() => []);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
