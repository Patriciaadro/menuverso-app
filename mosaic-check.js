#!/usr/bin/env node
// ============================================================================
// Phase-1 verification — venue hero photo MOSAIC (NeoTaste pattern).
//   node mosaic-check.js index.html
// Structural JSDOM checks (no layout engine): tile pattern, focal-point crop,
// anchored badge/name, tap→full-screen gallery at index, Esc close,
// single-photo fallback, zero render errors.
// NOTE: JSDOM never fires Image load events, so the orientation probe resolves
// via its 1200 ms fallback (all photos treated landscape) — the pattern is
// still exercised end-to-end. Real portrait/landscape slotting is eyeballed in
// a browser (Sky Lounge @390px).
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let pass = 0, fail = 0; const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS  ' + name); }
  else { fail++; results.push('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function boot(uid) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.HTMLElement.prototype.scrollBy = w.HTMLElement.prototype.scrollBy || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('x'));
      if (uid) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/.test(m)) e.push(m); });
    } });
  return dom.window;
}
const ev = (w, r, p) => w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mvRoute: r, mvParams: p || {} } }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function () {
  // ---- Multi-photo venue (6 photos, distinct focal points) ----
  const w = boot('u_demo_member');
  w.eval(`(function(){
    const P = "${PNG}";
    store.partnerVenues=[{id:"pv_b",slug:"sky-lounge",name:"Sky Lounge",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:[{url:P+"#1",focal_x:10,focal_y:20},P+"#2",P+"#3"],
      foodPhotos:[P+"#4",{url:P+"#5",focal_x:80,focal_y:70}],venuePhotos:[P+"#6"],menuPhotos:[],
      deals:[{id:"d1",title:"2×1 cocktails",active:true,savingsEur:17,cooldownDays:7}],dealSlots:[],rating:4.5,reviews:3,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
    saveStore();
  })()`);
  ev(w, 'venue', { slug: 'sky-lounge' });
  const root = w.document.getElementById('root');

  const mosaic = root.querySelector('.mv-mosaic');
  check('Mosaic container renders for multi-photo venue', !!mosaic);
  const strip = mosaic && mosaic.querySelector('.snaprow');
  check('Scrollable strip present inside mosaic', !!strip);

  // Cover tile is synchronous; the rest append after the 1200ms probe fallback.
  check('Cover tile renders immediately (before probe settles)', strip && strip.children.length === 1 && !!strip.children[0].querySelector('button img'));
  await sleep(1500);

  check('All 6 photos placed as tappable tiles', strip && strip.querySelectorAll('button img').length === 6,
    'tiles=' + (strip ? strip.querySelectorAll('button img').length : 0));
  // Pattern large → column(2) → large → column(2): 4 direct children, columns hold 2 imgs.
  const kids = strip ? [...strip.children] : [];
  const shape = kids.map(k => k.querySelectorAll('img').length).join(',');
  check('Tile pattern large→column→large→column (1,2,1,2)', shape === '1,2,1,2', 'shape=' + shape);

  const coverImg = kids[0] && kids[0].querySelector('img');
  check('Cover photo is first (photos[0] in first large tile)', coverImg && coverImg.src.endsWith('#1'));
  check('Cover tile honors its focal point (10% 20%)', coverImg && /object-position:\s*10%\s*20%/.test(coverImg.style.cssText),
    coverImg && coverImg.style.cssText);
  const allImgs = strip ? [...strip.querySelectorAll('img')] : [];
  check('Every tile crops with object-fit:cover', allImgs.length === 6 && allImgs.every(i => /object-fit:\s*cover/.test(i.style.cssText)));
  check('Default focal fallback 50% 40% applied to string photos', allImgs.some(i => /object-position:\s*50%\s*40%/.test(i.style.cssText)));

  // Badge + name anchored to the container, NOT inside the scroller.
  const badge = [...mosaic.children].find(c => /6\s*(fotos|photos)/.test(c.textContent) && !c.classList.contains('snaprow'));
  check('"6 fotos" badge anchored outside the scroller', !!badge);
  const nameOverlay = [...mosaic.querySelectorAll(':scope > div')].find(d => /Sky Lounge/.test(d.textContent));
  check('Venue name + open/closed badge anchored outside the scroller', !!nameOverlay && !strip.contains(nameOverlay));
  check('Desktop hover arrows present (2)', mosaic.querySelectorAll('.mv-mosaic-arrow').length === 2);
  check('No "+N" overlay anywhere on the strip', !/\+\d+\s*$/.test(strip.textContent.trim()));

  // Tap tile #4 (index 3) → full-screen gallery at that index.
  const tileBtns = [...strip.querySelectorAll('button')];
  tileBtns[3].click();
  const dlg = w.document.querySelector('[role="dialog"][aria-modal="true"]');
  check('Tapping a tile opens the full-screen gallery', !!dlg);
  check('Gallery holds all 6 photos, uncropped (contain)', dlg && [...dlg.querySelectorAll('img')].filter(i => /object-fit:\s*contain/.test(i.style.cssText)).length === 6);
  check('Gallery opens at the tapped photo\'s index (counter 4 / 6)', dlg && /4\s*\/\s*6/.test(dlg.textContent), dlg && (dlg.textContent.match(/\d\s*\/\s*\d/) || [])[0]);
  check('Body scroll locked while gallery open', w.document.documentElement.style.overflow === 'hidden');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape closes the gallery + unlocks scroll', !w.document.querySelector('[role="dialog"][aria-modal="true"]') && w.document.documentElement.style.overflow !== 'hidden');

  check('Multi-photo venue render — 0 errors', w.__e.length === 0, w.__e.slice(0, 2).join(' | '));

  // ---- Single-photo fallback keeps the old cover-fit hero ----
  const w2 = boot('u_demo_member');
  w2.eval(`(function(){
    store.partnerVenues=[{id:"pv_c",slug:"solo-bar",name:"Solo Bar",barrio:"Gràcia",cuisine:"Drinks",priceTier:2,status:"LIVE",
      photos:["${PNG}"],foodPhotos:[],venuePhotos:[],menuPhotos:[],
      deals:[{id:"d1",title:"2×1",active:true,savingsEur:8,cooldownDays:7}],dealSlots:[],rating:4.2,reviews:1,lat:41.4,lng:2.15,liveDeal:{dealSlots:[]}}];
    saveStore();
  })()`);
  ev(w2, 'venue', { slug: 'solo-bar' });
  await sleep(50);
  const r2 = w2.document.getElementById('root');
  check('Fallback: 1-photo venue has NO mosaic', !r2.querySelector('.mv-mosaic'));
  const solo = [...r2.querySelectorAll('div')].find(d => /clamp\(220px/.test(d.getAttribute('style') || ''));
  check('Fallback: previous single cover-fit hero kept', !!solo && /object-fit:cover/.test(solo.innerHTML));
  check('Fallback: venue name still overlaid', /Solo Bar/.test((solo && solo.textContent) || ''));
  check('Single-photo venue render — 0 errors', w2.__e.length === 0, w2.__e.slice(0, 2).join(' | '));

  // ---- Discover card untouched (route renders clean with photo venues) ----
  ev(w, 'app');
  await sleep(50);
  check('Discover route still renders — 0 errors', w.__e.length === 0, w.__e.slice(0, 2).join(' | '));

  console.log('\n--- Phase 1 mosaic verification ---');
  console.log(results.join('\n'));
  console.log('------------------------------------');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
