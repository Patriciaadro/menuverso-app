// Menuverso · the only write path to public.venues (QA item 7).
// Vercel Serverless Function (Node). POST { id, data, editKey? }
// Optional header x-mv-admin-key (admin devices).
//
// Before: the page wrote venues straight to Supabase with the publishable key,
// so anyone reading the source could rename, edit or wipe any venue. After the
// lockdown SQL (supabase/migrations/20261020130000_venue_write_lockdown.sql)
// the publishable key is read-only (LIVE rows) and every write comes here.
//
// Admin (valid x-mv-admin-key): may write any row, incl. seed_ overrides and
//   DELETED_BY_ADMIN tombstones.
// Partner (no admin key):
//   - new venue id, no key on file -> created with status DRAFT/PENDING_APPROVAL
//     only; the response carries a fresh editKey for this venue (shown once).
//   - existing venue -> needs the matching editKey (403 otherwise).
//   - may only set status DRAFT or PENDING_APPROVAL (anything else keeps the
//     stored status: no self-approval), and cannot change admin-set fields.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_WRITE_SECRET.
// Missing any -> 500 server_not_configured, and the app falls back to its
// legacy direct write (which the lockdown SQL then refuses).

const { configured, sha256, newKey, safeEqual, isAdmin, sb, VENUE_ID_RE } = require('../lib/venue-auth');

const PARTNER_STATUSES = ['DRAFT', 'PENDING_APPROVAL'];
// Fields only Menuverso sets (approval, governance, moderation, ratings).
const PROTECTED = ['approvedAt', 'offerPublishedAt', 'offerVersion', 'liveDeal', 'rejectionReason',
  'removedAt', 'removalReason', 'rating', 'reviews', 'deleted_at'];

function partnerData(data, prev) {
  const out = Object.assign({}, data);
  const prevStatus = prev && prev.status;
  if (!(PARTNER_STATUSES.includes(out.status) || out.status === prevStatus)) out.status = prevStatus || 'DRAFT';
  PROTECTED.forEach(k => {
    if (prev && Object.prototype.hasOwnProperty.call(prev, k)) out[k] = prev[k];
    else delete out[k];
  });
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!configured()) { res.status(500).json({ error: 'server_not_configured' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(body.id || '');
    const data = body.data;
    if (!VENUE_ID_RE.test(id) || !data || typeof data !== 'object' || Array.isArray(data)) { res.status(400).json({ error: 'bad_request' }); return; }

    const getRow = await sb('venues?select=id,data&id=eq.' + encodeURIComponent(id));
    if (!getRow.ok) { res.status(502).json({ error: 'read_failed' }); return; }
    const existing = ((await getRow.json().catch(() => [])) || [])[0] || null;

    let toWrite = Object.assign({}, data, { id: data.id || id });
    let issuedKey = null;

    if (!isAdmin(req)) {
      if (id.indexOf('seed_') === 0) { res.status(403).json({ error: 'admin_only' }); return; }
      const prev = existing && existing.data ? existing.data : null;
      if (prev && (prev.status === 'DELETED_BY_ADMIN' || prev.status === 'DELETED_AUDIT')) { res.status(403).json({ error: 'venue_deleted' }); return; }
      const keyRes = await sb('venue_edit_keys?select=key_hash&venue_id=eq.' + encodeURIComponent(id));
      if (!keyRes.ok) { res.status(502).json({ error: 'read_failed' }); return; }
      const keyRow = ((await keyRes.json().catch(() => [])) || [])[0] || null;
      if (keyRow) {
        if (!body.editKey || !safeEqual(sha256(body.editKey), keyRow.key_hash)) { res.status(403).json({ error: 'bad_edit_key' }); return; }
      } else if (existing) {
        // A venue that predates the lockdown: the admin issues its key (/api/venue-key).
        res.status(403).json({ error: 'edit_key_required' }); return;
      } else {
        issuedKey = newKey();
        const ins = await sb('venue_edit_keys', { method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ venue_id: id, key_hash: sha256(issuedKey) }) });
        if (!ins.ok) { res.status(502).json({ error: 'key_store_failed' }); return; }
      }
      toWrite = partnerData(toWrite, prev);
    }

    const up = await sb('venues?on_conflict=id', { method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id, data: toWrite, updated_at: new Date().toISOString() }) });
    if (!up.ok) {
      // Don't leave a key the partner never received (they'd be locked out).
      if (issuedKey) { try { await sb('venue_edit_keys?venue_id=eq.' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {} }
      res.status(502).json({ error: 'write_failed' }); return;
    }
    res.status(200).json(issuedKey ? { ok: true, editKey: issuedKey } : { ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
