// Hard diagnostic: drive the REAL app (real handlers, real DOM) and assert.
// Reports PASS/FAIL per check. Honest about what cannot be tested headlessly.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS  ' + name); }
  else { fail++; results.push('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}

function boot(uid) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('x'));
      if (uid) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/.test(m)) e.push(m); });
    } });
  return dom.window;
}
const ev = (w, r, p) => w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mvRoute: r, mvParams: p || {} } }));
const fire = (el, type) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(type, { bubbles: true }));

// ============================================================
// SECTION A — Admin save persists savings + frequency (the reported "No changes" bug)
// Drives the REAL buildEditForm() + Save button.
// ============================================================
(function () {
  const w = boot('u_demo_admin');
  // create one partner venue directly (as the admin "Add venue" handler does)
  w.eval(`(function(){
    store.partnerVenues=[{id:"pv_t",ownerId:null,name:"Test Bar",slug:"test-bar",barrio:"Eixample",cuisine:"Drinks",priceTier:2,
      address:"",postcode:"",phone:"",website:"",instagram:"",description:"",hours:"",
      photos:[],foodPhotos:[],venuePhotos:[],menuPhotos:[],dealTerms:"",dealSlots:[],
      deals:[{id:"d1",title:"2×1 cocktails",description:"",active:true,savingsEur:7,cooldownDays:30}],
      rating:4.5,reviews:0,status:"LIVE",liveDeal:{dealSlots:[]},offerVersion:1}];
    saveStore();
  })()`);
  // Drive the REAL admin UI: navigate to Partners tab, click the row's Edit button.
  ev(w, 'admin', { tab: 'partners' });
  const root0 = w.document.getElementById('root');
  const editBtn = [...root0.querySelectorAll('button')].find(b => /^(Editar|Edit)$/.test(b.textContent.trim()));
  check('A: admin Partners tab shows venue Edit button', !!editBtn, 'no Edit button rendered');
  if (!editBtn) return;
  editBtn.click();
  const form = root0.querySelector('[data-edit-form]') || root0.querySelector('[data-venue-row] form, [data-venue-row]');
  check('A: clicking Edit opens the editor form', !!form);
  if (!form) return;
  // savings = number input currently showing 7
  const nums = [...form.querySelectorAll('input[type=number]')];
  const savInput = nums.find(i => i.value === '7' || i.placeholder === 'ej. 24');
  check('A: savings input found', !!savInput);
  const recSel = [...form.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Cada') || o.textContent.includes('diario')));
  check('A: frequency select found', !!recSel);
  if (savInput) { savInput.value = '19'; fire(savInput, 'input'); }
  if (recSel) {
    const opt90 = [...recSel.options].find(o => o.value === '90');
    if (opt90) { recSel.value = '90'; fire(recSel, 'change'); }
  }
  const saveBtn = [...form.querySelectorAll('button')].find(b => /save changes|guardar/i.test(b.textContent));
  check('A: Save button found', !!saveBtn);
  if (saveBtn) saveBtn.click();
  const d0 = w.eval('store.partnerVenues[0].deals[0]');
  check('A: savings PERSISTED after Save (7→19)', d0 && d0.savingsEur === 19, 'got savingsEur=' + (d0 && d0.savingsEur));
  check('A: frequency PERSISTED after Save (30→90)', d0 && d0.cooldownDays === 90, 'got cooldownDays=' + (d0 && d0.cooldownDays));
  // Re-open + Save with no changes → should be a no-op (not corrupt the data)
  ev(w, 'admin', { tab: 'partners' });
  const root1 = w.document.getElementById('root');
  const editBtn2 = [...root1.querySelectorAll('button')].find(b => /^(Editar|Edit)$/.test(b.textContent.trim()));
  if (editBtn2) editBtn2.click();
  const form2 = root1.querySelector('[data-edit-form]');
  const save2 = form2 && [...form2.querySelectorAll('button')].find(b => /save changes|guardar/i.test(b.textContent));
  if (save2) save2.click();
  const d0b = w.eval('store.partnerVenues[0].deals[0]');
  check('A: unchanged re-save keeps values (no corruption)', d0b && d0b.savingsEur === 19 && d0b.cooldownDays === 90);
  check('A: admin editor render — 0 errors', w.__e.length === 0, w.__e.slice(0,2).join(' | '));
})();

// ============================================================
// SECTION B — Data model helpers
// ============================================================
(function () {
  const w = boot('u_demo_admin');
  w.eval(`store.partnerVenues=[{id:"pv_t",slug:"test-bar",name:"Test Bar",cuisine:"Drinks",barrio:"Eixample",priceTier:3,status:"LIVE",
    photos:[],deals:[{id:"d1",title:"2×1",active:true,savingsEur:33,cooldownDays:7}],dealSlots:[],liveDeal:{dealSlots:[]},rating:4.5,reviews:1,lat:41.39,lng:2.16}];saveStore();`);
  const v = w.eval('findVenueBySlug("test-bar")');
  const deals = w.eval('getVenueDeals(findVenueBySlug("test-bar"))');
  check('B: getVenueDeals returns the deal', Array.isArray(deals) && deals.length === 1);
  check('B: getVenueDeals keeps custom savingsEur (33)', deals[0] && deals[0].savingsEur === 33, 'got ' + (deals[0]&&deals[0].savingsEur));
  check('B: getVenueDeals keeps custom cooldownDays (7)', deals[0] && deals[0].cooldownDays === 7, 'got ' + (deals[0]&&deals[0].cooldownDays));
  const labEs = w.eval('dealRecurrencyLabel(getVenueDeals(findVenueBySlug("test-bar"))[0], true)');
  const labEn = w.eval('dealRecurrencyLabel(getVenueDeals(findVenueBySlug("test-bar"))[0], false)');
  check('B: recurrency label reflects 7 days (not hardcoded 30)', !/30/.test(String(labEs)+String(labEn)), 'es="'+labEs+'" en="'+labEn+'"');
})();

// ============================================================
// SECTION C — Member-facing render of an admin-created LIVE venue
// with uploaded photo + custom savings/frequency.
// ============================================================
(function () {
  const w = boot('u_demo_member');
  w.eval(`(function(){
    const mk=(id,slug,name,photo,sav)=>({id,slug,name,barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:photo?[photo]:[],foodPhotos:[],venuePhotos:[],menuPhotos:[],
      deals:[{id:"d1",title:"2×1 cocktails",active:true,savingsEur:sav,cooldownDays:7},{id:"d2",title:"2 por 1 cervezas",active:true,savingsEur:6,cooldownDays:7}],
      dealSlots:[],rating:4.5,reviews:3,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}});
    // 2 venues so the 2nd lands on the old "ink" decorative slot (index 1)
    store.partnerVenues=[mk("pv_a","local-a","Local A",null,5), mk("pv_b","sky-lounge","Sky Lounge","${PNG}",17)];
    saveStore();
  })()`);
  ev(w, 'app');
  const root = w.document.getElementById('root');
  const dataImgs = [...root.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => s.startsWith('data:image'));
  check('C: Discover shows the uploaded photo (decorative-slot bug)', dataImgs.length >= 1, 'uploaded imgs=' + dataImgs.length);
  check('C: Discover shows custom savings €17', /~€17|€17/.test(root.textContent), 'no €17 in discover');
  check('C: Discover render — 0 errors', w.__e.length === 0, w.__e.slice(0,2).join(' | '));

  // venue detail
  const w2 = boot('u_demo_member');
  w2.eval(`(function(){
    store.partnerVenues=[{id:"pv_b",slug:"sky-lounge",name:"Sky Lounge",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:["${PNG}"],foodPhotos:[],venuePhotos:[],menuPhotos:[],
      deals:[{id:"d1",title:"2×1 cocktails",active:true,savingsEur:17,cooldownDays:7}],dealSlots:[],rating:4.5,reviews:3,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
    saveStore();
  })()`);
  ev(w2, 'venue', { slug: 'sky-lounge' });
  const r2 = w2.document.getElementById('root');
  const vImgs = [...r2.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => s.startsWith('data:image'));
  check('C: Venue page shows the uploaded photo', vImgs.length >= 1, 'uploaded imgs=' + vImgs.length);
  check('C: Venue page shows deal title', /cocktails/i.test(r2.textContent));
  check('C: Venue page recurrency reflects 7 days (not 30)', !/cada 30 d|every 30 d/i.test(r2.textContent), 'found a 30-day label');
  check('C: Venue page render — 0 errors', w2.__e.length === 0, w2.__e.slice(0,2).join(' | '));
})();

// ============================================================
// SECTION D — Profile savings total = sum of per-deal savings (not count × AVG)
// ============================================================
(function () {
  const w = boot('u_demo_member');
  w.eval(`(function(){
    const uid="u_demo_member";
    store.partnerVenues=[{id:"pv_b",slug:"sky-lounge",name:"Sky Lounge",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:[],deals:[{id:"d1",title:"2×1",active:true,savingsEur:17,cooldownDays:7}],dealSlots:[],rating:4.5,reviews:3,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
    // field names match the REAL redeem flow (line 5380): memberId + redeemedAt
    store.redemptions=[
      {memberId:uid,venueSlug:"sky-lounge",dealId:"d1",redeemedAt:Date.now()-86400000*3,method:"SLIDE_CONFIRM"},
      {memberId:uid,venueSlug:"sky-lounge",dealId:"d1",redeemedAt:Date.now()-86400000*1,method:"SLIDE_CONFIRM"}
    ];
    saveStore();
  })()`);
  ev(w, 'profile');
  const t = w.document.getElementById('root').textContent || '';
  // 2 redemptions × €17 = €34 expected
  check('D: Profile total savings = €34 (2×€17, per-deal sum)', /34/.test(t), 'no 34 found in profile');
  check('D: Profile render — 0 errors', w.__e.length === 0, w.__e.slice(0,2).join(' | '));
})();

// ============================================================
// SECTION E — Clean slate (seeds hidden everywhere)
// ============================================================
(function () {
  const w = boot('u_demo_admin');
  check('E: getAllVenues empty on fresh clean-slate store', w.eval('getAllVenues().length') === 0, 'count=' + w.eval('getAllVenues().length'));
  ev(w, 'admin');
  const t = w.document.getElementById('root').textContent || '';
  check('E: admin overview has no "Cervecer"', !/Cervecer/i.test(t));
  check('E: admin render — 0 errors', w.__e.length === 0, w.__e.slice(0,2).join(' | '));
})();

// ============================================================
// SECTION F — Robustness: every top-level screen renders without throwing
// ============================================================
(function () {
  const screens = [['member', ['app','bookings','profile']], ['admin', ['admin']], ['partner', ['partner']]];
  const uids = { member: 'u_demo_member', admin: 'u_demo_admin', partner: 'u_demo_partner' };
  for (const [role, routes] of screens) {
    const w = boot(uids[role]);
    let ok = true, err = '';
    for (const r of routes) { try { ev(w, r); } catch (e) { ok = false; err = r + ':' + e.message; break; } }
    if (w.__e.length) { ok = false; err = w.__e[0]; }
    check('F: ' + role + ' screens render — 0 errors', ok, err);
  }
})();

// Minimal Leaflet mock so the Map screen can init and paint its side-list.
// (Real tiles/pins still require a browser; this exercises the list + cards.)
function installLeafletMock(w) {
  const noop = () => {};
  w.L = {
    map: () => { const m = { setView: () => m, on: () => m, addLayer: noop, removeLayer: noop, fitBounds: noop, remove: noop, invalidateSize: noop }; return m; },
    tileLayer: () => ({ addTo: () => ({}) }),
    markerClusterGroup: () => ({ clearLayers: noop, addLayer: noop, on: noop }),
    marker: () => { const m2 = { on: () => m2, bindPopup: () => m2, addTo: () => m2 }; return m2; },
    featureGroup: () => ({ getBounds: () => ({}) }),
    divIcon: (o) => o || {}
  };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 30));

// ============================================================
// SECTION G — Map-side list renders the uploaded photo + BOTH deal chips [o]
// ============================================================
async function sectionG() {
  const w = boot('u_demo_member');
  installLeafletMock(w);
  w.eval(`(function(){
    store.partnerVenues=[{id:"pv_b",slug:"sky-lounge",name:"Sky Lounge",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:["${PNG}"],foodPhotos:[],venuePhotos:[],menuPhotos:[],
      deals:[{id:"d1",title:"2×1 cocktails",active:true,savingsEur:17,cooldownDays:7},{id:"d2",title:"2 por 1 cervezas",active:true,savingsEur:6,cooldownDays:7}],
      dealSlots:[],rating:4.5,reviews:3,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
    saveStore();
  })()`);
  ev(w, 'map');
  await tick(60); // let setTimeout(initMap,0) → repopulate → paintList run
  const root = w.document.getElementById('root');
  const dataImgs = [...root.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => s.startsWith('data:image'));
  check('G: map-side list painted at least one card', /sky lounge/i.test(root.textContent), 'list did not paint');
  check('G: map list shows the uploaded photo (real-color fix)', dataImgs.length >= 1, 'no data:image in map list');
  const chips = root.textContent;
  check('G: map list shows BOTH deal chips [o]', /cocktails/i.test(chips) && /cervezas/i.test(chips), 'missing one of the two deals');
  check('G: map render — 0 errors', w.__e.length === 0, w.__e.slice(0,2).join(' | '));
}

// ============================================================
// SECTION H — Real photo-upload path: drive the admin file input → Save → render
// (compressImage uses canvas, unavailable headless, so it is stubbed to a known
//  data URL; everything else — the input handler, push, diff/save, render — is real.)
// ============================================================
async function sectionH() {
  const w = boot('u_demo_admin');
  // size-guard is pure JS → test it for real (no stub) BEFORE stubbing.
  let guardOk = false;
  try {
    const r = await w.eval(`compressImage({ size: 9*1024*1024, name:'big.jpg' })`).then(() => 'resolved', e => e && e.code);
    guardOk = (r === 'PHOTO_TOO_LARGE');
  } catch (e) { guardOk = false; }
  check('H: compressImage rejects >8MB files (real size guard)', guardOk);

  // stub compressImage (canvas not available headless), then drive the real upload UI.
  const stubbed = w.eval(`(function(){ try { compressImage = function(){ return Promise.resolve(${JSON.stringify(PNG)}); }; return typeof compressImage === 'function'; } catch(e){ return 'ERR:'+e.message; } })()`);
  check('H: compressImage is globally overridable (stub installed)', stubbed === true, 'got ' + stubbed);
  w.eval(`(function(){
    store.partnerVenues=[{id:"pv_u",ownerId:null,name:"Upload Bar",slug:"upload-bar",barrio:"Eixample",cuisine:"Drinks",priceTier:2,
      address:"",postcode:"",phone:"",website:"",instagram:"",description:"",hours:"",
      photos:[],foodPhotos:[],venuePhotos:[],menuPhotos:[],dealTerms:"",dealSlots:[],
      deals:[{id:"d1",title:"2×1",description:"",active:true,savingsEur:10,cooldownDays:30}],
      rating:4.5,reviews:0,status:"LIVE",liveDeal:{dealSlots:[]},offerVersion:1}];
    saveStore();
  })()`);
  ev(w, 'admin', { tab: 'partners' });
  const root = w.document.getElementById('root');
  const editBtn = [...root.querySelectorAll('button')].find(b => /^(Editar|Edit)$/.test(b.textContent.trim()));
  if (editBtn) editBtn.click();
  const form = root.querySelector('[data-edit-form]');
  check('H: admin editor opened', !!form);
  if (!form) return;
  const fileInput = form.querySelector('input[type=file]');
  check('H: photo upload input present', !!fileInput);
  if (fileInput) {
    const file = new w.File(['xxxx'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick(50); // async onchange → await compressImage stub → push → renderCat
  }
  const saveBtn = [...form.querySelectorAll('button')].find(b => /save changes|guardar/i.test(b.textContent));
  if (saveBtn) saveBtn.click();
  const photos = w.eval('store.partnerVenues[0].photos');
  check('H: uploaded photo persisted to venue.photos', Array.isArray(photos) && photos[0] === PNG, 'photos.len=' + (photos && photos.length));

  // now confirm a member actually sees it on Discover
  const w2 = boot('u_demo_member');
  w2.eval(`(function(){
    store.partnerVenues=[{id:"pv_u",slug:"upload-bar",name:"Upload Bar",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:[${JSON.stringify(PNG)}],foodPhotos:[],venuePhotos:[],menuPhotos:[],
      deals:[{id:"d1",title:"2×1",active:true,savingsEur:10,cooldownDays:30}],dealSlots:[],rating:4.5,reviews:1,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
    saveStore();
  })()`);
  ev(w2, 'app');
  const imgs = [...w2.document.getElementById('root').querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => s.startsWith('data:image'));
  check('H: uploaded photo shows on Discover end-to-end', imgs.length >= 1, 'uploaded imgs=' + imgs.length);
}

(async function main() {
  try { await sectionG(); } catch (e) { check('G: section ran without throwing', false, e.message); }
  try { await sectionH(); } catch (e) { check('H: section ran without throwing', false, e.message); }
  console.log('\n================ HARD DIAGNOSTIC ================');
  console.log(results.join('\n'));
  console.log('------------------------------------------------');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  console.log('NOTE: headless harness cannot verify real pixels/CSS, live tiles,');
  console.log('      Supabase round-trips, or email — verify those on the deployed site.');
  console.log('================================================');
  process.exit(fail ? 1 : 0);
})();
