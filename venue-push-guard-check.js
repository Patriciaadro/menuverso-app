#!/usr/bin/env node
// ============================================================================
// Venue push guard: a device must never push venue rows to Supabase until it
// has pulled the current rows from Supabase in this session.
//   node venue-push-guard-check.js index.html
//
// Why: production venue photos are ~5.2 MB of base64, over the ~5 MB
// localStorage quota, so the venue cache is always saved with inline photos
// STRIPPED (persistStore). On the next boot store.partnerVenues comes from that
// photo-less cache until the Supabase pull lands. An admin save in that window
// (slow network, or the pull failing) makes scheduleVenueSync upsert EVERY
// venue with data = the photo-less object, permanently erasing all photos.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(1300000);   // ~1.3 MB each
const REMOTE = [
  { id: 'pv_real1', updated_at: '2026-10-20T10:00:00Z', data: { id: 'pv_real1', slug: 'real-one', name: 'Real One', status: 'LIVE', lat: 41.39, lng: 2.16, ownerId: 'u_demo_partner',
    photos: [BIG, BIG], foodPhotos: [BIG], deals: [{ id: 'd1', title: '2x1', active: true }] } },
  { id: 'pv_real2', updated_at: '2026-10-20T10:00:00Z', data: { id: 'pv_real2', slug: 'real-two', name: 'Real Two', status: 'LIVE', lat: 41.40, lng: 2.17,
    photos: [BIG], deals: [{ id: 'd2', title: 'Café gratis', active: true }] } }
];

// pullMode: 'ok' (instant), 'slow' (lands after delayMs), 'fail' (HTTP 503)
function boot({ snapshot, userId, pullMode = 'ok', delayMs = 4000 }) {
  const pushes = [];
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
      w.fetch = (url, opts) => {
        url = String(url); const method = (opts && opts.method) || 'GET';
        if (url.includes('/rest/v1/venues') && method === 'GET') {
          if (pullMode === 'fail') return Promise.resolve(json(503, { message: 'unavailable' }));
          const resp = json(200, JSON.parse(JSON.stringify(REMOTE)));
          return pullMode === 'slow' ? new Promise(r => setTimeout(() => r(resp), delayMs)) : Promise.resolve(resp);
        }
        if (url.includes('/rest/v1/venues') && method === 'POST') {
          try { pushes.push(JSON.parse(opts.body)); } catch (e) {}
          return Promise.resolve(json(201, null));
        }
        return Promise.reject(new Error('offline'));
      };
      if (snapshot) Object.keys(snapshot).forEach(k => { if (k !== 'menuverso_session_v4') w.localStorage.setItem(k, snapshot[k]); });
      w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  dom.window.__pushes = pushes;
  return dom.window;
}
const snap = w => { const s = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); s[k] = w.localStorage.getItem(k); } return s; };
const hasInline = d => JSON.stringify(d || {}).includes('data:image/');
const strippedPush = (pushes) => pushes.filter(p => p && p.id && p.id.indexOf('pv_real') === 0 && !hasInline(p.data));

(async () => {
  // --- Device A, admin, first visit: pull lands with full photos ------------
  const a = boot({ userId: 'u_demo_admin', pullMode: 'ok' });
  await sleep(300);
  check('Setup: pull hydrated the real venues with photos', a.eval(`store.partnerVenues.some(v=>v.id==='pv_real1' && (v.photos||[]).length===2)`));
  a.eval('saveStore()');
  await sleep(1500);
  const cache = a.localStorage.getItem('menuverso_demo_v4_venues') || '';
  check('Setup: venue cache was saved photo-less (quota), as in production', cache.includes('pv_real1') && !cache.includes('data:image/'));
  check('Normal admin save after a successful pull still syncs WITH photos', a.__pushes.some(p => p.id === 'pv_real1' && hasInline(p.data)), a.__pushes.length + ' pushes');
  check('...and never pushes a photo-less copy', strippedPush(a.__pushes).length === 0);
  const afterA = snap(a);

  // --- Device A reloads on a slow network: admin clicks before pull lands ---
  const b = boot({ snapshot: afterA, userId: 'u_demo_admin', pullMode: 'slow', delayMs: 4000 });
  await sleep(200);
  check('Reload: venues come from the photo-less cache', b.eval(`(store.partnerVenues.find(v=>v.id==='pv_real1')||{photos:['x']}).photos.length`) === 0);
  b.eval('saveStore()');           // any admin action
  await sleep(2000);               // past the 1.2 s sync debounce, pull still in flight
  check('SLOW PULL: no photo-less venue pushed before the pull lands', strippedPush(b.__pushes).length === 0,
    strippedPush(b.__pushes).map(p => p.id).join(','));
  await sleep(3000);               // pull lands
  check('SLOW PULL: photos restored once the pull lands', b.eval(`(store.partnerVenues.find(v=>v.id==='pv_real1')||{}).photos.length`) === 2);
  await sleep(1500);               // NO second save: the deferred sync must fire by itself
  check('SLOW PULL: deferred sync fires on its own, WITH photos', b.__pushes.some(p => p.id === 'pv_real1' && hasInline(p.data)), b.__pushes.length + ' pushes');
  check('SLOW PULL: pushed rows carry no internal _mvPhotosStripped tag', b.__pushes.every(p => !JSON.stringify(p).includes('_mvPhotosStripped')));
  b.eval('saveStore()');
  await sleep(1500);
  check('SLOW PULL: later saves keep syncing WITH photos', b.__pushes.filter(p => p.id === 'pv_real1' && hasInline(p.data)).length >= 2);
  check('SLOW PULL: still never a photo-less copy', strippedPush(b.__pushes).length === 0);

  // --- Pull fails outright (Supabase 503) -----------------------------------
  const c = boot({ snapshot: afterA, userId: 'u_demo_admin', pullMode: 'fail' });
  await sleep(200);
  c.eval('saveStore()');
  await sleep(2000);
  check('FAILED PULL: nothing photo-less is pushed', strippedPush(c.__pushes).length === 0, strippedPush(c.__pushes).map(p => p.id).join(','));

  // --- Partner owner, same window ------------------------------------------
  const d = boot({ snapshot: afterA, userId: 'u_demo_partner', pullMode: 'slow', delayMs: 4000 });
  await sleep(200);
  d.eval('saveStore()');
  await sleep(2000);
  check('PARTNER SLOW PULL: own venue not pushed photo-less', strippedPush(d.__pushes).length === 0);

  // --- Pull succeeds but does NOT return a cached venue (e.g. once anon can only
  //     read LIVE rows, QA item 7): its photo-less cached copy must not be pushed.
  const e = boot({ snapshot: afterA, userId: 'u_demo_admin', pullMode: 'ok' });
  await sleep(400);                // let the boot pull land first
  // Simulate the pull having omitted pv_real1: its local copy stays the photo-less cached one.
  e.eval(`store.partnerVenues = store.partnerVenues.map(v => v.id === 'pv_real1' ? Object.assign({}, v, { photos: [], _mvPhotosStripped: true }) : v);`);
  e.__pushes.length = 0;
  e.eval('saveStore()');
  await sleep(1600);
  check('UNRETURNED STRIPPED VENUE: never pushed', !e.__pushes.some(p => p.id === 'pv_real1'), e.__pushes.map(p => p.id).join(','));
  check('UNRETURNED STRIPPED VENUE: other venues still sync', e.__pushes.some(p => p.id === 'pv_real2' && hasInline(p.data)));

  // --- Member: never pushes venues at all (unchanged) -----------------------
  const m = boot({ snapshot: afterA, userId: 'u_demo_member', pullMode: 'ok' });
  await sleep(200); m.eval('saveStore()'); await sleep(1500);
  check('Member saves never push venues', m.__pushes.length === 0);

  for (const w of [a, b, c, d, e, m]) check('No runtime errors', w.__e.length === 0, w.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
