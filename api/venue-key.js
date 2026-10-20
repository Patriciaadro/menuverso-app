// Menuverso · issue (or rotate) a partner's venue edit key (QA item 7).
// Vercel Serverless Function (Node). POST { venueId }, header x-mv-admin-key.
//
// Venues created before the lockdown have no edit key, so their owners can't
// sync edits until the admin issues one. The response carries a one-time link
// (https://www.menuverso.com/para-locales?vk=<venueId>.<key>) to send to the
// owner; opening it stores the key on their device. Issuing again rotates the
// key (the old link stops working).
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_WRITE_SECRET.

const { configured, isAdmin, sb, sha256, newKey, VENUE_ID_RE } = require('../lib/venue-auth');
const SITE = 'https://www.menuverso.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!configured()) { res.status(500).json({ error: 'server_not_configured' }); return; }
  if (!isAdmin(req)) { res.status(401).json({ error: 'admin_key_required' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const venueId = String(body.venueId || '');
    if (!VENUE_ID_RE.test(venueId) || venueId.indexOf('pv_') !== 0) { res.status(400).json({ error: 'bad_venue_id' }); return; }
    const key = newKey();
    const r = await sb('venue_edit_keys?on_conflict=venue_id', { method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ venue_id: venueId, key_hash: sha256(key), rotated_at: new Date().toISOString() }) });
    if (!r.ok) { res.status(502).json({ error: 'key_store_failed' }); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ ok: true, venueId, editKey: key, link: SITE + '/para-locales?vk=' + encodeURIComponent(venueId + '.' + key) });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
