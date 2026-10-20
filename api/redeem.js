// Menuverso · record a redemption (member slide-to-confirm → partner live feed).
// Vercel Serverless Function (Node).
// POST { venueSlug, memberId?, memberName?, dealId?, dealTitle?, redeemedAt?, clientId? }
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
    // Client-generated id makes retries idempotent: the app queues failed
    // pushes and resends them on the next boot, and a request that timed out
    // after the insert succeeded must not create a second row.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clientId = (typeof body.clientId === 'string' && UUID_RE.test(body.clientId)) ? body.clientId.toLowerCase() : null;
    const row = {
      venue_slug: venueSlug,
      member_id: body.memberId ? String(body.memberId).slice(0, 80) : null,
      member_name: body.memberName ? String(body.memberName).slice(0, 120) : null,
      deal_id: body.dealId ? String(body.dealId).slice(0, 80) : null,
      deal_title: body.dealTitle ? String(body.dealTitle).slice(0, 160) : null,
      // Hostile-input guard: a malformed redeemedAt must not 500 (which would
      // silently drop the redemption). Fall back to now on an invalid date.
      redeemed_at: (function () { const d = body.redeemedAt ? new Date(body.redeemedAt) : new Date(); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); })()
    };
    if (clientId) row.id = clientId;
    // ignore-duplicates: a resend of an already-stored clientId is a no-op
    // that still answers 2xx (PostgREST returns an empty array).
    const r = await fetch(SUPABASE_URL + '/rest/v1/redemptions' + (clientId ? '?on_conflict=id' : ''), {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json',
        Prefer: clientId ? 'return=representation,resolution=ignore-duplicates' : 'return=representation' },
      body: JSON.stringify(row)
    });
    if (!r.ok) { res.status(502).json({ error: 'insert_failed' }); return; }
    const out = await r.json().catch(() => null);
    const inserted = Array.isArray(out) && out.length > 0;
    if (clientId && !inserted) { res.status(200).json({ ok: true, id: clientId, duplicate: true }); return; }
    // Realtime Broadcast ping so the partner's "Canjes en vivo" feed updates
    // instantly. Best-effort — the feed also polls as a safety net. The channel
    // name must match the client's: "redeem:<venueSlug>".
    try {
      await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: 'redeem:' + venueSlug, event: 'new', payload: { redeemed_at: row.redeemed_at } }] })
      });
    } catch (e) { /* best-effort */ }
    res.status(200).json({ ok: true, id: (Array.isArray(out) && out[0] && out[0].id) || null });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
