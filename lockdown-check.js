#!/usr/bin/env node
// ============================================================================
// QA item 7: venue write lockdown.   node lockdown-check.js index.html
// Part A runs the real /api handlers against an in-memory PostgREST.
// Part B boots index.html in JSDOM and checks every client write/read path.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.resolve(process.argv[2] || 'index.html');
const ROOT = path.dirname(SRC_PATH);
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// ---------------------------------------------------------------- Part A
const DB = { venues: {}, keys: {} };
let failVenueWrite = false;
function pgFetch(url, opts = {}) {
  const u = new URL(url); const m = (opts.method || 'GET').toUpperCase();
  const table = u.pathname.split('/').pop(); const q = u.searchParams;
  const eq = (k) => { const v = q.get(k); return v && v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null; };
  if (table === 'venues') {
    if (m === 'GET') { const id = eq('id'); const rows = Object.values(DB.venues).filter(r => !id || r.id === id); return Promise.resolve(resp(200, JSON.parse(JSON.stringify(rows)))); }
    if (m === 'POST') { if (failVenueWrite) return Promise.resolve(resp(500, {})); const b = JSON.parse(opts.body); DB.venues[b.id] = JSON.parse(JSON.stringify(b)); return Promise.resolve(resp(201, null)); }
  }
  if (table === 'venue_edit_keys') {
    if (m === 'GET') { const id = eq('venue_id'); const r = DB.keys[id]; return Promise.resolve(resp(200, r ? [{ key_hash: r.key_hash }] : [])); }
    if (m === 'POST') { const b = JSON.parse(opts.body); const upsert = q.get('on_conflict') === 'venue_id';
      if (DB.keys[b.venue_id] && !upsert) return Promise.resolve(resp(409, {})); DB.keys[b.venue_id] = b; return Promise.resolve(resp(201, null)); }
    if (m === 'DELETE') { delete DB.keys[eq('venue_id')]; return Promise.resolve(resp(204, null)); }
  }
  return Promise.resolve(resp(404, {}));
}
function loadFns(env) {
  ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_WRITE_SECRET'].forEach(k => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; });
  ['lib/venue-auth.js', 'api/venue-upsert.js', 'api/venues-all.js', 'api/venue-key.js'].forEach(f => delete require.cache[path.join(ROOT, f)]);
  global.fetch = pgFetch;
  return { upsert: require(path.join(ROOT, 'api/venue-upsert.js')), all: require(path.join(ROOT, 'api/venues-all.js')), key: require(path.join(ROOT, 'api/venue-key.js')) };
}
async function call(fn, { method = 'POST', headers = {}, body = {} } = {}) {
  let status = 0, json = null;
  await fn({ method, headers, body }, { status(s) { status = s; return this; }, json(b) { json = b; return this; }, setHeader() {} });
  return { status, json };
}
const ADM = { 'x-mv-admin-key': 'S3cret-admin' };

async function partA() {
  let F = loadFns({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  check('A: without ADMIN_WRITE_SECRET every function answers 500 (client keeps legacy path)',
    (await call(F.upsert, { body: { id: 'pv_a', data: {} } })).status === 500 && (await call(F.all, { method: 'GET' })).status === 500 && (await call(F.key, { body: { venueId: 'pv_a' } })).status === 500);

  F = loadFns({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_WRITE_SECRET: 'S3cret-admin' });
  let r = await call(F.upsert, { body: { id: 'pv_new1', data: { id: 'pv_new1', name: 'Nuevo', status: 'LIVE', approvedAt: 1, liveDeal: { title: 'x' } } } });
  check('A: partner creates a new venue and receives an edit key', r.status === 200 && r.json && typeof r.json.editKey === 'string' && r.json.editKey.length > 20, JSON.stringify(r));
  const key1 = r.json && r.json.editKey;
  const v1 = DB.venues.pv_new1 && DB.venues.pv_new1.data;
  check('A: partner cannot self-approve on create (LIVE → DRAFT)', v1 && v1.status === 'DRAFT', v1 && v1.status);
  check('A: admin-set fields stripped on partner create', v1 && !('approvedAt' in v1) && !('liveDeal' in v1));
  check('A: only the key hash is stored', DB.keys.pv_new1 && DB.keys.pv_new1.key_hash !== key1 && /^[0-9a-f]{64}$/.test(DB.keys.pv_new1.key_hash));
  check('A: second write without the key → 403', (await call(F.upsert, { body: { id: 'pv_new1', data: { name: 'Hack' } } })).status === 403);
  check('A: wrong key → 403', (await call(F.upsert, { body: { id: 'pv_new1', data: { name: 'Hack' }, editKey: 'nope' } })).status === 403);
  r = await call(F.upsert, { body: { id: 'pv_new1', data: { id: 'pv_new1', name: 'Nuevo Bar', status: 'PENDING_APPROVAL' }, editKey: key1 } });
  check('A: partner with key submits for review', r.status === 200 && DB.venues.pv_new1.data.status === 'PENDING_APPROVAL' && DB.venues.pv_new1.data.name === 'Nuevo Bar');
  r = await call(F.upsert, { headers: ADM, body: { id: 'pv_new1', data: Object.assign({}, DB.venues.pv_new1.data, { status: 'LIVE', approvedAt: 111, liveDeal: { title: '2x1' } }) } });
  check('A: admin approves (LIVE + governance fields)', r.status === 200 && DB.venues.pv_new1.data.status === 'LIVE' && DB.venues.pv_new1.data.liveDeal.title === '2x1');
  r = await call(F.upsert, { body: { id: 'pv_new1', data: { id: 'pv_new1', name: 'Nuevo Bar', status: 'PAUSED', approvedAt: 999, liveDeal: { title: 'GRATIS TODO' }, rating: 5 }, editKey: key1 } });
  const v2 = DB.venues.pv_new1.data;
  check('A: partner edit keeps the stored status (no self-pause/approve)', r.status === 200 && v2.status === 'LIVE', v2.status);
  check('A: partner cannot rewrite the approved deal or approval stamp', v2.liveDeal.title === '2x1' && v2.approvedAt === 111 && !('rating' in v2) , JSON.stringify(v2));

  DB.venues.pv_old = { id: 'pv_old', data: { id: 'pv_old', name: 'Antiguo', status: 'LIVE' } };
  check('A: pre-lockdown venue without a key → 403 edit_key_required', (r = await call(F.upsert, { body: { id: 'pv_old', data: { name: 'x' } } })).status === 403 && r.json.error === 'edit_key_required');
  check('A: key issuance needs the admin key', (await call(F.key, { body: { venueId: 'pv_old' } })).status === 401);
  r = await call(F.key, { headers: ADM, body: { venueId: 'pv_old' } });
  check('A: admin issues an edit link', r.status === 200 && /\/para-locales\?vk=pv_old\./.test(r.json.link), JSON.stringify(r.json));
  const oldKey = r.json.editKey;
  check('A: owner edits with the issued key', (await call(F.upsert, { body: { id: 'pv_old', data: { id: 'pv_old', name: 'Antiguo 2', status: 'LIVE' }, editKey: oldKey } })).status === 200 && DB.venues.pv_old.data.name === 'Antiguo 2');
  await call(F.key, { headers: ADM, body: { venueId: 'pv_old' } });
  check('A: re-issuing rotates the key (old link stops working)', (await call(F.upsert, { body: { id: 'pv_old', data: { name: 'x' }, editKey: oldKey } })).status === 403);

  check('A: partner can\'t write seed_ overrides', (await call(F.upsert, { body: { id: 'seed_foo', data: { _seedOverride: true } } })).status === 403);
  check('A: admin can write seed_ overrides', (await call(F.upsert, { headers: ADM, body: { id: 'seed_foo', data: { _seedOverride: true, slug: 'foo' } } })).status === 200);
  check('A: wrong admin key is treated as a partner (403 on an existing venue)', (await call(F.upsert, { headers: { 'x-mv-admin-key': 'guess' }, body: { id: 'pv_old', data: { name: 'pwn' } } })).status === 403);
  check('A: malformed id → 400', (await call(F.upsert, { headers: ADM, body: { id: "pv_x'; drop", data: {} } })).status === 400);
  await call(F.upsert, { headers: ADM, body: { id: 'pv_new1', data: { id: 'pv_new1', status: 'DELETED_BY_ADMIN' } } });
  check('A: partner can\'t resurrect an admin-deleted venue', (await call(F.upsert, { body: { id: 'pv_new1', data: { status: 'PENDING_APPROVAL' }, editKey: key1 } })).status === 403);
  check('A: venues-all refuses without / with a wrong admin key', (await call(F.all, { method: 'GET' })).status === 401 && (await call(F.all, { method: 'GET', headers: { 'x-mv-admin-key': 'no' } })).status === 401);
  r = await call(F.all, { method: 'GET', headers: ADM });
  check('A: venues-all returns every row to the admin', r.status === 200 && Array.isArray(r.json) && r.json.length === Object.keys(DB.venues).length);
  failVenueWrite = true;
  r = await call(F.upsert, { body: { id: 'pv_fail', data: { name: 'x' } } });
  failVenueWrite = false;
  check('A: failed write after issuing a key rolls the key back', r.status === 502 && !DB.keys.pv_fail);
}

// ---------------------------------------------------------------- Part B
function boot({ userId, url, api = 'ok', pullRows, adminKey, venueKeys, setup }) {
  const calls = [];
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: url || 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.localStorage.setItem('mv_lang_v2', 'es');
      if (userId) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId, expiresAt: Date.now() + 9e11 }));
      if (adminKey) w.localStorage.setItem('mv_admin_write_key', adminKey);
      if (venueKeys) w.localStorage.setItem('mv_venue_edit_keys', JSON.stringify(venueKeys));
      w.fetch = (u, o) => {
        u = String(u); const m = (o && o.method) || 'GET'; const h = (o && o.headers) || {};
        let body = null; try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) {}
        calls.push({ u, m, h, body });
        if (u === '/api/venue-upsert') {
          if (api === '500') return Promise.resolve(resp(500, { error: 'server_not_configured' }));
          if (api === '403') return Promise.resolve(resp(403, { error: 'edit_key_required' }));
          return Promise.resolve(resp(200, body && !body.editKey && !h['x-mv-admin-key'] ? { ok: true, editKey: 'K-' + body.id } : { ok: true }));
        }
        if (u === '/api/venues-all') return Promise.resolve(h['x-mv-admin-key'] === 'good' ? resp(200, pullRows || []) : resp(401, {}));
        if (u.includes('/rest/v1/venues') && m === 'GET') return Promise.resolve(resp(200, pullRows || []));
        if (u.includes('/rest/v1/venues') && m === 'POST') return Promise.resolve(resp(201, null));
        return Promise.reject(new Error('offline'));
      };
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const msg = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(msg)) e.push(msg); });
    } });
  dom.window.__calls = calls;
  return dom.window;
}
const PARTNER = `store.users.push({ id:'u_p1', email:'p1@example.com', passwordHash:'pwhash:x12345678', role:'PARTNER_OWNER', partnerVenueId:'pv_cl1', createdAt:Date.now(), verifiedAt:Date.now() });
  store.partnerVenues.push({ id:'pv_cl1', slug:'cl1', name:'Cl1', status:'DRAFT', ownerId:'u_p1', deals:[], dealSlots:[], photos:[] }); saveStore();`;
const live = (id, extra) => ({ id, data: Object.assign({ id, slug: id, name: id, status: 'LIVE', lat: 41.39, lng: 2.16, priceTier: 2, rating: 4.5, deals: [{ id: 'd', title: '2x1', active: true }] }, extra || {}) });

async function partB() {
  // Partner: first sync gets a key, later syncs send it
  let w = boot({ pullRows: [live('pv_other')] }); await sleep(250);
  w.eval(PARTNER + ` setSession('u_p1');`);
  w.eval(`syncVenueToSupabase(store.partnerVenues.find(v => v.id === 'pv_cl1'))`); await sleep(50);
  let up = w.__calls.filter(c => c.u === '/api/venue-upsert');
  check('B: partner sync goes to /api/venue-upsert (not the public REST)', up.length === 1 && !w.__calls.some(c => c.u.includes('/rest/v1/venues') && c.m === 'POST'));
  check('B: issued key is stored on the device', JSON.parse(w.localStorage.getItem('mv_venue_edit_keys') || '{}').pv_cl1 === 'K-pv_cl1');
  w.eval(`syncVenueToSupabase(store.partnerVenues.find(v => v.id === 'pv_cl1'))`); await sleep(50);
  up = w.__calls.filter(c => c.u === '/api/venue-upsert');
  check('B: next sync sends the edit key', up[1] && up[1].body.editKey === 'K-pv_cl1');
  check('B: partner request carries no admin key', !up.some(c => c.h['x-mv-admin-key']));

  // Function not configured → legacy direct write (rollout)
  w = boot({ api: '500', pullRows: [live('pv_other')] }); await sleep(250);
  w.eval(PARTNER + ` setSession('u_p1'); syncVenueToSupabase(store.partnerVenues.find(v => v.id === 'pv_cl1'));`); await sleep(80);
  check('B: function not configured (500) → legacy write during rollout', w.__calls.some(c => c.u.includes('/rest/v1/venues') && c.m === 'POST'));
  // Refused → no fallback
  w = boot({ api: '403', pullRows: [live('pv_other')] }); await sleep(250);
  w.eval(PARTNER + ` setSession('u_p1'); syncVenueToSupabase(store.partnerVenues.find(v => v.id === 'pv_cl1'));`); await sleep(80);
  check('B: refused (403) → NO fallback to the public key', !w.__calls.some(c => c.u.includes('/rest/v1/venues') && c.m === 'POST'));

  // Admin with key: header + full read
  w = boot({ userId: 'u_demo_admin', adminKey: 'good', pullRows: [live('pv_a1'), { id: 'pv_p1', data: { id: 'pv_p1', name: 'Pend', status: 'PENDING_APPROVAL' } }] }); await sleep(300);
  check('B: unlocked admin reads every row via /api/venues-all', w.__calls.some(c => c.u === '/api/venues-all' && c.h['x-mv-admin-key'] === 'good') && w.eval(`store.partnerVenues.some(v => v.id === 'pv_p1')`));
  w.eval(`syncVenueToSupabase(store.partnerVenues.find(v => v.id === 'pv_a1'))`); await sleep(50);
  check('B: admin writes send the admin key', w.__calls.some(c => c.u === '/api/venue-upsert' && c.h['x-mv-admin-key'] === 'good'));
  w.eval(`go('admin')`); await sleep(100);
  const txtA = [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ');
  check('B: admin overview shows "unlocked" state', /desbloqueada en este dispositivo/i.test(txtA));
  check('B: venue list offers "Enlace de edición"', (w.eval(`go('admin',{tab:'partners'})`), [...w.document.querySelectorAll('button')].some(b => /Enlace de edición/.test(b.textContent))));

  // Admin without key: unlock card shown, anon read
  w = boot({ userId: 'u_demo_admin', pullRows: [live('pv_a1')] }); await sleep(300);
  check('B: admin without key reads the public way', !w.__calls.some(c => c.u === '/api/venues-all'));
  w.eval(`go('admin')`); await sleep(100);
  const txtB = [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ');
  check('B: admin overview shows the unlock card', /Desbloquea la escritura de administrador/.test(txtB));

  // Edit-key link
  w = boot({ url: 'https://www.menuverso.com/para-locales?vk=pv_abc123.KeyKey_123' }); await sleep(400);
  check('B: ?vk= link stores the edit key', JSON.parse(w.localStorage.getItem('mv_venue_edit_keys') || '{}').pv_abc123 === 'KeyKey_123');
  check('B: ?vk= is stripped from the address bar', !/vk=/.test(w.location.href), w.location.href);

  // Prune: a LIVE venue no longer public disappears from member devices
  w = boot({ userId: 'u_demo_member', pullRows: [live('pv_still')], setup: null });
  await sleep(50);
  w.eval(`store.partnerVenues.push(${JSON.stringify(live('pv_gone').data)}); store.partnerVenues.push(${JSON.stringify(live('pv_still').data)});`);
  await w.eval(`fetchVenuesFromSupabaseAndMerge()`);
  check('B: venue paused/removed elsewhere disappears from a member device', !w.eval(`store.partnerVenues.some(v => v.id === 'pv_gone')`) && w.eval(`store.partnerVenues.some(v => v.id === 'pv_still')`));
  w = boot({ pullRows: [live('pv_still')] }); await sleep(250);
  w.eval(PARTNER + ` const me = store.partnerVenues.find(v => v.id === 'pv_cl1'); me.status = 'LIVE'; setSession('u_p1');`);
  await w.eval(`fetchVenuesFromSupabaseAndMerge()`);
  check('B: a partner\'s own LIVE venue is never pruned from their device', w.eval(`store.partnerVenues.some(v => v.id === 'pv_cl1')`));

  check('B: no runtime errors', w.__e.length === 0, w.__e.join(' | '));
}

(async () => {
  const savedFetch = global.fetch;
  await partA();
  global.fetch = savedFetch;
  await partB();
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
