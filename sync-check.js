#!/usr/bin/env node
// ============================================================================
// QA item 5 — visits follow the member across devices.
//   node sync-check.js index.html
// Part 1 runs the real api/redeem.js + api/member-redemptions.js handlers
// against an in-memory PostgREST stand-in. Part 2 boots the real index.html
// as two separate devices (separate localStorage) wired to that same backend.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const API = path.join(__dirname, 'api');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- fake DB ----
const table = [];                       // public.redemptions
let apiDown = false;                    // simulate Vercel 5xx
let apiMissing = false;                 // simulate a 404 (function not deployed)
let lastSupabaseUrl = '';
global.fetch = async (url, opts = {}) => {          // what the handlers call
  lastSupabaseUrl = url;
  const u = new URL(url);
  if (u.pathname === '/rest/v1/redemptions' && (opts.method || 'GET') === 'POST') {
    const row = JSON.parse(opts.body);
    const ignoreDup = /ignore-duplicates/.test((opts.headers || {}).Prefer || '');
    if (row.id && table.some(r => r.id === row.id)) {
      if (ignoreDup) return { ok: true, status: 201, json: async () => [] };
      return { ok: false, status: 409, json: async () => ({}) };
    }
    const stored = Object.assign({ id: row.id || ('gen-' + table.length), acknowledged_at: null }, row);
    table.push(stored);
    return { ok: true, status: 201, json: async () => [stored] };
  }
  if (u.pathname === '/rest/v1/redemptions') {
    const m = (u.searchParams.get('member_id') || '').replace(/^eq\./, '');
    const rows = table.filter(r => r.member_id === m).sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
    return { ok: true, status: 200, json: async () => rows };
  }
  if (u.pathname === '/realtime/v1/api/broadcast') return { ok: true, status: 202, json: async () => ({}) };
  return { ok: false, status: 404, json: async () => ({}) };
};
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
const redeem = require(path.join(API, 'redeem.js'));
const memberRedemptions = require(path.join(API, 'member-redemptions.js'));

function callHandler(h, { method = 'GET', query = {}, body } = {}) {
  return new Promise(resolve => {
    const res = { _s: 200, _h: {}, status(c) { this._s = c; return this; }, setHeader(k, v) { this._h[k] = v; },
      json(b) { resolve({ status: this._s, body: b, headers: this._h }); } };
    h({ method, query, body }, res);
  });
}

// What the app's fetch('/api/...') hits, routed to the real handlers.
async function appFetch(url, opts = {}) {
  const u = new URL(url, 'https://www.menuverso.com');
  if (apiDown && u.pathname.startsWith('/api/')) return { ok: false, status: 500, json: async () => ({ error: 'server_not_configured' }) };
  if (apiMissing && u.pathname.startsWith('/api/')) return { ok: false, status: 404, json: async () => ({}) };
  let r;
  if (u.pathname === '/api/redeem') r = await callHandler(redeem, { method: opts.method || 'GET', body: opts.body });
  else if (u.pathname === '/api/member-redemptions') r = await callHandler(memberRedemptions, { query: Object.fromEntries(u.searchParams) });
  else return Promise.reject(new Error('offline'));
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
}

function device(snapshot) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = appFetch;
      if (snapshot) Object.keys(snapshot).forEach(k => w.localStorage.setItem(k, snapshot[k]));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const snap = w => { const s = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); s[k] = w.localStorage.getItem(k); } return s; };
// Same two steps the slide-to-confirm onClose performs.
const redeemOn = (w, slug, dealId) => w.eval(`(function(){
  const u = currentUser();
  store.redemptions.unshift({ memberId:u.id, venueSlug:${JSON.stringify(slug)}, dealId:${JSON.stringify(dealId)}, redeemedAt:Date.now(), method:'SLIDE_CONFIRM' });
  saveStore();
  pushRedemptionToSupabase({ venueSlug:${JSON.stringify(slug)}, memberId:u.id, memberName:fullName(u), dealId:${JSON.stringify(dealId)}, dealTitle:'Café gratis', redeemedAt:Date.now() });
})()`);
const safeEval = async (w, code) => { try { return await w.eval(code); } catch (e) { return undefined; } };
const outbox = w => JSON.parse(w.localStorage.getItem('mv_redeem_outbox_v1') || '[]');
// Stands in for the boot pull from Supabase (offline here): same venue on every device.
const addVenue = w => w.eval(`(function(){ if (store.partnerVenues.some(v=>v.id==='pv_t')) return;
  store.partnerVenues.push({ id:'pv_t', slug:'cafe-test', name:'Café Test', status:'LIVE', barrio:'Gràcia', cuisine:'Café', lat:41.40, lng:2.15,
    deals:[ { id:'d_two', title:'2x1 brunch', active:true, savingsEur:9 }, { id:'d_cafe', title:'Café gratis', active:true, savingsEur:3 } ] }); })()`);

(async () => {
  // ============================ Part 1: handlers =============================
  let r = await callHandler(memberRedemptions, { query: { member: 'u_x&member_id=neq.zzz' } });
  check('member-redemptions rejects PostgREST filter injection', r.status === 400, JSON.stringify(r));
  r = await callHandler(memberRedemptions, { query: {} });
  check('member-redemptions requires a member id', r.status === 400);
  r = await callHandler(memberRedemptions, { method: 'POST', query: { member: 'u_abc123' } });
  check('member-redemptions is GET-only', r.status === 405);
  const cid = '3f2a1c4e-9b7d-4e21-a0c3-5d6e7f8a9b0c';
  r = await callHandler(redeem, { method: 'POST', body: { venueSlug: 'Cafe-X', memberId: 'u_t', dealId: 'd_cafe', clientId: cid } });
  check('redeem stores deal_id and uses clientId as row id', r.status === 200 && table[0].id === cid && table[0].deal_id === 'd_cafe' && table[0].venue_slug === 'cafe-x', JSON.stringify(table[0]));
  r = await callHandler(redeem, { method: 'POST', body: { venueSlug: 'cafe-x', memberId: 'u_t', clientId: cid } });
  check('redeem resend with same clientId is a 2xx no-op', r.status === 200 && r.body.duplicate === true && table.length === 1, JSON.stringify(r.body));
  r = await callHandler(redeem, { method: 'POST', body: { venueSlug: 'cafe-x', clientId: 'not-a-uuid' } });
  check('redeem ignores a malformed clientId (server generates id)', r.status === 200 && table.length === 2 && table[1].id !== 'not-a-uuid');
  table.length = 0;

  // ============================ Part 2: two devices ==========================
  // No seed-purge flag: a real first visit runs the purge, which empties the
  // demo redemptions initialStore gives Maria.
  const session = { menuverso_session_v4: JSON.stringify({ userId: 'u_demo_member', expiresAt: Date.now() + 9e11 }) };

  // Device A, API down: redemption must be queued, not lost.
  apiDown = true;
  const a1 = device(session); await sleep(150);
  addVenue(a1);
  const slug = 'cafe-test', dealId = 'd_cafe';   // the SECOND deal on purpose
  redeemOn(a1, slug, dealId); await sleep(50);
  check('API down: nothing reaches the server', table.length === 0);
  check('API down: redemption queued in the outbox', outbox(a1).length === 1 && outbox(a1)[0].venueSlug === slug);
  check('Queued row carries a clientId (uuid)', /^[0-9a-f-]{36}$/.test((outbox(a1)[0] || {}).clientId || ''));

  // Device A reboots with the API fixed: outbox flushes exactly once.
  apiDown = false;
  const a2 = device(snap(a1)); addVenue(a2); await sleep(200);
  check('Next boot: queued redemption delivered', table.length === 1 && table[0].member_id === 'u_demo_member' && table[0].venue_slug === slug, JSON.stringify(table));
  check('Next boot: outbox emptied', outbox(a2).length === 0);
  check('Device A keeps a single local visit (no self-duplicate from sync)', a2.eval(`store.redemptions.filter(r=>r.memberId==='u_demo_member').length`) === 1);

  // Resend of an already-delivered row (timed-out request) stays single.
  a2.localStorage.setItem('mv_redeem_outbox_v1', JSON.stringify([Object.assign({}, outbox(a1)[0])]));
  await safeEval(a2, 'flushRedemptionOutbox()'); await sleep(30);
  check('Retrying an already-stored row does not duplicate it', table.length === 1);

  // Device B: different browser, empty storage, signs in through loginUser.
  const b = device({}); addVenue(b); await sleep(150);
  check('Device B starts with no visits', b.eval(`store.redemptions.filter(r=>r.memberId==='u_demo_member').length`) === 0);
  await b.eval(`loginUser({ email:'maria@menuverso.com', password:'member123' })`);
  await sleep(200);
  const bRows = b.eval(`JSON.stringify(store.redemptions.filter(r=>r.memberId==='u_demo_member'))`);
  const br = JSON.parse(bRows);
  check('Device B after login: Maria\'s visit is merged in', br.length === 1 && br[0].venueSlug === slug, bRows);
  check('Merged visit keeps its deal id (savings resolve to the right deal)', br[0] && br[0].dealId === dealId, `${br[0] && br[0].dealId} vs ${dealId}`);
  check('Device B savings = €3 (the redeemed deal, not the venue\'s first deal at €9)', b.eval(`memberSavingsEur(currentUser())`) === 3, String(b.eval(`memberSavingsEur(currentUser())`)));
  check('Device B persisted the merge to localStorage', JSON.parse(b.localStorage.getItem('menuverso_demo_v4')).redemptions.some(r => r.venueSlug === slug));
  b.dispatchEvent(new b.PopStateEvent('popstate', { state: { mvRoute: 'profile', mvParams: {} } })); await sleep(50);
  const visitas = [...b.document.querySelectorAll('#root *')].find(n => /^(VISITAS|VISITS|Visitas|Visits)$/.test((n.textContent || '').trim()));
  const card = visitas && visitas.parentElement;
  check('Device B Profile shows Visitas = 1', !!card && /\b1\b/.test(card.textContent), card && card.textContent.trim().slice(0, 60));

  // Device B reboots: session sync must not duplicate already-merged rows.
  const b2 = device(snap(b)); addVenue(b2); await sleep(200);
  check('Re-sync on boot is idempotent', b2.eval(`store.redemptions.filter(r=>r.memberId==='u_demo_member').length`) === 1);

  // A 4xx-rejected row is dropped instead of retried forever.
  b2.localStorage.setItem('mv_redeem_outbox_v1', JSON.stringify([{ clientId: '11111111-2222-4333-8444-555555555555', venueSlug: '' }]));
  await safeEval(b2, 'flushRedemptionOutbox()');
  check('Invalid queued row (400) is dropped, not retried forever', outbox(b2).length === 0 && table.length === 1);

  // A 404 (function missing mid-deploy, or a static local server) is transient.
  apiMissing = true;
  b2.localStorage.setItem('mv_redeem_outbox_v1', JSON.stringify([{ clientId: '66666666-7777-4888-8999-aaaaaaaaaaaa', venueSlug: 'cafe-test', memberId: 'u_demo_member' }]));
  await safeEval(b2, 'flushRedemptionOutbox()');
  check('404 from /api keeps the row queued (not dropped)', outbox(b2).length === 1);
  apiMissing = false;
  await safeEval(b2, 'flushRedemptionOutbox()');
  check('...and it is delivered once the function exists', outbox(b2).length === 0 && table.length === 2);

  check('No runtime errors on any device', [a1, a2, b, b2].every(w => w.__e.length === 0), [a1, a2, b, b2].map(w => w.__e.join('|')).join(' || '));

  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
