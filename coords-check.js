#!/usr/bin/env node
// ============================================================================
// QA item 9: no LIVE venue without coordinates; address geocoding on save.
//   node coords-check.js index.html
// Nominatim is mocked: addresses containing "Mallorca" resolve, others miss.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(userId) {
  const geo = [];
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = (u) => {
        u = String(u);
        if (u.indexOf('https://nominatim.openstreetmap.org/search') === 0) {
          const q = decodeURIComponent(u.split('q=')[1] || ''); geo.push(q);
          const hit = /mallorca/i.test(q) ? [{ lat: '41.3953', lon: '2.1620' }] : [];
          return Promise.resolve({ ok: true, status: 200, json: async () => hit });
        }
        if (u.includes('/rest/v1/venues')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        return Promise.reject(new Error('offline'));
      };
      if (userId) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  dom.window.__geo = geo;
  return dom.window;
}
const venue = (id, extra) => Object.assign({ id, slug: id.replace('pv_', ''), name: 'Venue ' + id, cuisine: 'Tapas', barrio: 'Eixample', status: 'PENDING_APPROVAL',
  ownerId: 'u_x', deals: [{ id: 'd1', title: '2x1', active: true }], dealSlots: [], photos: [] }, extra);

(async () => {
  const w = boot('u_demo_admin');
  await sleep(200);
  w.eval(`store.partnerVenues.push(${JSON.stringify(venue('pv_addr', { address: 'C/ Mallorca 236', postcode: '08008' }))});
          store.partnerVenues.push(${JSON.stringify(venue('pv_noaddr', { address: '' }))});
          store.partnerVenues.push(${JSON.stringify(venue('pv_strcoords', { lat: '41.40', lng: '2.17' }))});
          store.partnerVenues.push(${JSON.stringify(venue('pv_livebad', { status: 'LIVE', name: 'New mexican' }))});`);

  // Helpers
  check('mvHasCoords: numbers', w.eval(`mvHasCoords({lat:41.39,lng:2.16})`) === true);
  check('mvHasCoords: missing / empty / 0,0 rejected', w.eval(`!mvHasCoords({}) && !mvHasCoords({lat:'',lng:''}) && !mvHasCoords({lat:0,lng:0}) && !mvHasCoords({lat:'abc',lng:2})`));
  const ok1 = await w.eval(`mvEnsureCoords(store.partnerVenues.find(v=>v.id==='pv_addr'))`);
  check('Geocodes an address without coordinates', ok1 === true && w.eval(`(v=>v.lat===41.3953 && v.lng===2.162)(store.partnerVenues.find(v=>v.id==='pv_addr'))`));
  check('Geocode query is biased to Barcelona when the city is missing', /Barcelona$/.test(w.__geo[0] || ''), w.__geo[0]);
  const ok2 = await w.eval(`mvEnsureCoords(store.partnerVenues.find(v=>v.id==='pv_noaddr'))`);
  check('No address, no coordinates → refused', ok2 === false);
  const ok3 = await w.eval(`mvEnsureCoords(store.partnerVenues.find(v=>v.id==='pv_strcoords'))`);
  check('Numeric-string coordinates are normalised to numbers', ok3 === true && w.eval(`typeof store.partnerVenues.find(v=>v.id==='pv_strcoords').lat`) === 'number');

  // Admin approve buttons (approval queue + venue list) on a venue that can't be located
  w.eval(`go('admin')`); await sleep(200);
  const clickApprove = async () => {
    const btns = [...w.document.querySelectorAll('button')].filter(b => /^\s*(Approve|Aprobar)\s*$/.test(b.textContent));
    for (const b of btns) { b.click(); await sleep(1300); }
    return btns.length;
  };
  const n = await clickApprove();
  check('Admin view exposes Approve buttons', n > 0, String(n));
  check('Approve: venue without location stays PENDING', w.eval(`store.partnerVenues.find(v=>v.id==='pv_noaddr').status`) === 'PENDING_APPROVAL');
  check('Approve: located venue goes LIVE', w.eval(`store.partnerVenues.find(v=>v.id==='pv_addr').status`) === 'LIVE');
  check('Approve: toast explains the missing location', /sin ubicación|no location/i.test(w.document.body.textContent));

  // Map safety net: a LIVE venue without coordinates is not pinned
  const shape = w.eval(`JSON.stringify(toMemberShape(store.partnerVenues.find(v=>v.id==='pv_livebad')))`);
  check('Member shape flags coordinate-less venue', JSON.parse(shape).hasCoords === false);
  check('Member shape keeps real coordinates flagged true', JSON.parse(w.eval(`JSON.stringify(toMemberShape(store.partnerVenues.find(v=>v.id==='pv_addr')))`)).hasCoords === true);

  // Partner profile save re-geocodes after an address change
  w.eval(`(function(){ const v = store.partnerVenues.find(v=>v.id==='pv_addr'); v.geocodedFrom = mvGeoKey(v); v.address = 'Carrer de Mallorca 401'; })()`);
  const before = w.__geo.length;
  const changed = await w.eval(`mvRefreshCoordsIfAddressChanged(store.partnerVenues.find(v=>v.id==='pv_addr'))`);
  check('Partner save: address change triggers a new geocode', changed === true && w.__geo.length === before + 1);
  const again = await w.eval(`mvRefreshCoordsIfAddressChanged(store.partnerVenues.find(v=>v.id==='pv_addr'))`);
  check('Partner save: unchanged address does not re-geocode', again === false && w.__geo.length === before + 1);

  check('No runtime errors', w.__e.length === 0, w.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
