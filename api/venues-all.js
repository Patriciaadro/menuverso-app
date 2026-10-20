// Menuverso · all venue rows for the admin dashboard (QA item 7).
// Vercel Serverless Function (Node). GET, header x-mv-admin-key required.
//
// After the lockdown SQL the publishable key only reads LIVE rows, so the
// admin's approval queue (PENDING_APPROVAL, DRAFT, REJECTED, PAUSED…) is read
// here with the service role instead.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_WRITE_SECRET.

const { configured, isAdmin, sb } = require('../lib/venue-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!configured()) { res.status(500).json({ error: 'server_not_configured' }); return; }
  if (!isAdmin(req)) { res.status(401).json({ error: 'admin_key_required' }); return; }
  try {
    const r = await sb('venues?select=id,data,updated_at');
    if (!r.ok) { res.status(502).json({ error: 'read_failed' }); return; }
    const rows = await r.json().catch(() => []);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
