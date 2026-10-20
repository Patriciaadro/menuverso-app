// Menuverso · shared helpers for the venue write lockdown (QA item 7).
// Lives outside /api so Vercel doesn't expose it as an endpoint; the
// functions in /api require() it and Vercel bundles it with them.
//
// Interim model until partners and admins have real accounts (QA item 6):
// - Admin: sends header x-mv-admin-key; must equal env ADMIN_WRITE_SECRET.
//   Typed once per admin device, never shipped in the page.
// - Partner: proves ownership of one venue with an edit key the server
//   issued (on first sync of a new venue, or via an admin-issued link).
//   Only sha256(key) is stored, in public.venue_edit_keys (service role only).

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_WRITE_SECRET;

const configured = () => !!(SUPABASE_URL && SERVICE_KEY && ADMIN_SECRET);
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const newKey = () => crypto.randomBytes(24).toString('base64url');

// Constant-time comparison of two strings via their hashes.
function safeEqual(a, b) {
  const x = Buffer.from(sha256(a), 'hex'), y = Buffer.from(sha256(b), 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isAdmin(req) {
  const h = req && req.headers ? (req.headers['x-mv-admin-key'] || req.headers['X-MV-Admin-Key']) : '';
  return !!(ADMIN_SECRET && h && safeEqual(String(h), ADMIN_SECRET));
}
// PostgREST call with the service-role key (bypasses RLS; server only).
function sb(path, opts = {}) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, opts.headers || {})
  }));
}
// Venue / override ids the app generates: pv_xxxx, seed_<slug>.
const VENUE_ID_RE = /^(pv_|seed_)[A-Za-z0-9_-]{1,100}$/;

module.exports = { configured, sha256, newKey, safeEqual, isAdmin, sb, VENUE_ID_RE };
