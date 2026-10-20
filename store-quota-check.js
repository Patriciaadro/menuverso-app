#!/usr/bin/env node
// ============================================================================
// Store persistence under quota pressure.
//   node store-quota-check.js index.html
// Reproduces production (20 Oct 2026): the Supabase venue pull put ~5.2 MB of
// base64 photos into store.partnerVenues, JSON.stringify(store) exceeded the
// ~5 MB localStorage quota, and every saveStore() threw — so member data
// (prefs, redemptions, bookings, saved) silently never persisted.
// JSDOM enforces a 5,000,000 code-unit quota, the same order as Chrome.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Carry localStorage across "reloads" by snapshotting it into the next JSDOM.
function boot(snapshot) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      if (snapshot) Object.keys(snapshot).forEach(k => w.localStorage.setItem(k, snapshot[k]));
      else w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: 'u_demo_member', expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e; w.__consoleErrors = [];
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const snap = w => { const s = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); s[k] = w.localStorage.getItem(k); } return s; };

(async () => {
  // --- Device session 1: venue pull lands 5.4 MB of inline photos -----------
  const w1 = boot();
  await sleep(50);
  w1.eval(`(function(){
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(1300000);   // ~1.3 MB each
    store.partnerVenues.push({ id:'pv_heavy', slug:'heavy-venue', name:'Heavy', status:'LIVE', lat:41.39, lng:2.16,
      photos:[big, {url: big, focal_x:10}, 'https://img.example/ok.jpg'], foodPhotos:[big], venuePhotos:[big],
      deals:[{id:'d',title:'2x1',active:true}] });
  })()`);
  const storeChars = w1.eval('JSON.stringify(store).length');
  check('Reproduces production: store exceeds the 5 M quota', storeChars > 5000000, String(storeChars));

  // Member actions that previously vanished.
  w1.eval(`(function(){
    const u = currentUser();
    setPrefs(u, { cuisines:['Catalan'], barrios:['Gràcia'], dietary:[] });
    store.redemptions.push({ id:'r_test', userId:u.id, venueSlug:'heavy-venue', redeemedAt: Date.now() });
    saveStore();
  })()`);
  const core1 = JSON.parse(w1.localStorage.getItem('menuverso_demo_v4'));
  const m1 = core1.users.find(u => u.id === 'u_demo_member');
  check('Member prefs persisted despite oversized venues', m1 && m1.prefs && m1.prefs.cuisines[0] === 'Catalan');
  check('Redemption persisted despite oversized venues', (core1.redemptions || []).some(r => r.id === 'r_test'));
  check('Core blob no longer carries venue data', core1.partnerVenues === undefined && core1.seedOverrides === undefined);
  check('Core blob is small (< 100 KB)', w1.localStorage.getItem('menuverso_demo_v4').length < 100000, String(w1.localStorage.getItem('menuverso_demo_v4').length));

  const cache = w1.localStorage.getItem('menuverso_demo_v4_venues');
  check('Venue cache kept (inline images stripped to fit)', !!cache && cache.length < 5000000, cache ? String(cache.length) : 'missing');
  const hv = cache && JSON.parse(cache).partnerVenues.find(v => v.id === 'pv_heavy');
  check('Stripped cache keeps the venue itself', !!hv && hv.name === 'Heavy' && hv.lat === 41.39);
  check('Stripped cache keeps non-inline photo URLs', !!hv && hv.photos.length === 1 && hv.photos[0] === 'https://img.example/ok.jpg', hv && JSON.stringify(hv.photos).slice(0, 80));
  check('In-memory store still has full photos (UI unaffected)', w1.eval(`store.partnerVenues.find(v=>v.id==='pv_heavy').photos.length`) === 3);

  // --- Reload on the same device -------------------------------------------
  const w2 = boot(snap(w1));
  await sleep(50);
  check('After reload: prefs survive', w2.eval(`JSON.stringify((currentUser()||{}).prefs||null)`).includes('Catalan'));
  check('After reload: redemption survives', w2.eval(`store.redemptions.some(r=>r.id==='r_test')`));
  check('After reload: venues re-hydrated from cache', w2.eval(`store.partnerVenues.some(v=>v.id==='pv_heavy')`));
  check('After reload: seed venues still present', w2.eval(`Array.isArray(store.partnerVenues) && store.partnerVenues.length > 0`));

  // --- Legacy migration: an old single blob (venues inline) still loads ----
  const legacy = { menuverso_session_v4: JSON.stringify({ userId: 'u_demo_member', expiresAt: Date.now() + 9e11 }) };
  const w0 = boot();
  await sleep(30);
  legacy.menuverso_demo_v4 = w0.eval(`JSON.stringify(Object.assign({}, store, { partnerVenues: store.partnerVenues.concat([{id:'pv_legacy',slug:'legacy',name:'Legacy',status:'LIVE'}]) }))`);
  legacy.mv_seed_purged_v1 = '1';
  const w3 = boot(legacy);
  await sleep(30);
  check('Legacy single-blob store loads its inline venues', w3.eval(`store.partnerVenues.some(v=>v.id==='pv_legacy')`));
  w3.eval('saveStore()');
  check('First save after load splits the legacy blob', JSON.parse(w3.localStorage.getItem('menuverso_demo_v4')).partnerVenues === undefined
    && JSON.parse(w3.localStorage.getItem('menuverso_demo_v4_venues')).partnerVenues.some(v => v.id === 'pv_legacy'));

  check('No runtime errors', [w1, w2, w3].every(w => w.__e.length === 0), [w1, w2, w3].map(w => w.__e.join(' | ')).join(' || '));

  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
