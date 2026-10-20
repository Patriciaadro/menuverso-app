#!/usr/bin/env node
// ============================================================================
// QA item 2 — taste/preferences form (route 'onboarding-prefs').
//   node prefs-check.js index.html
// Simulates real chip taps through the rendered DOM: each tap re-renders the
// whole component, so this proves the selection survives re-render, Continue
// enables, prefs save, Skip clears the draft, and a different user never
// inherits someone else's half-finished draft.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(uid) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      if (uid) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const go = (w, r) => w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mvRoute: r, mvParams: {} } }));
const btn = (w, text) => [...w.document.querySelectorAll('#root button')].find(b => b.textContent.trim() === text);
const isRed = b => !!b && /\bbg-mv-500\b/.test(b.className);

(async () => {
  const w = boot('u_demo_member');
  await sleep(50);
  // Start from a member with no prefs (what "set up →" does).
  w.eval(`(function(){ const u=currentUser(); delete u.prefs; delete u.prefsSkipped; saveStore(); window.__mvPrefsDraft=null; })()`);
  go(w, 'onboarding-prefs'); await sleep(30);

  // Chips render in Spanish (MV_LANG 'es'); accept either language.
  const ES = { 'Catalan':'Catalana', 'Japanese':'Japonesa', 'Italian':'Italiana', 'Gràcia':'Gràcia' };
  const findChip = label => [...w.document.querySelectorAll('#root button')].find(b => { const t = b.textContent.trim(); return t === label || t === ES[label]; });
  const cont = () => [...w.document.querySelectorAll('#root button')].find(b => /Continue|Continuar/.test(b.textContent));

  check('Prefs screen renders', !!cont());
  check('Continue starts disabled', cont() && cont().disabled === true);

  // Tap two cuisines + one barrio, each via the live DOM (forces re-render).
  for (const label of ['Catalan', 'Japanese', 'Gràcia']) {
    const b = findChip(label);
    if (!b) { check(`Chip "${label}" exists`, false); continue; }
    b.click(); await sleep(10);
  }
  check('Tapped cuisine "Catalan" is red after re-render', isRed(findChip('Catalan')), findChip('Catalan') && findChip('Catalan').className);
  check('Tapped cuisine "Japanese" is red after re-render', isRed(findChip('Japanese')));
  check('Tapped barrio "Gràcia" is red after re-render', isRed(findChip('Gràcia')));
  check('Untapped chip "Italian" stays neutral', !isRed(findChip('Italian')));
  check('Continue enables once a cuisine is picked', cont() && cont().disabled === false);

  // Toggle off works.
  findChip('Japanese').click(); await sleep(10);
  check('Tapping "Japanese" again deselects it', !isRed(findChip('Japanese')));

  // Continue saves prefs and clears the draft.
  cont().click(); await sleep(30);
  const saved = w.eval(`JSON.stringify(currentUser().prefs)`);
  const p = JSON.parse(saved || 'null');
  check('Prefs saved on user', !!p && p.cuisines.join() === 'Catalan' && p.barrios.join() === 'Gràcia', saved);
  check('Saved prefs carry no draft userId field', p && !('userId' in p), saved);
  check('Draft cleared after Continue', w.eval(`window.__mvPrefsDraft`) === null);
  const persisted = JSON.parse(w.localStorage.getItem('menuverso_demo_v4'));
  const pu = persisted.users.find(x => x.id === 'u_demo_member');
  check('Prefs persisted to localStorage', pu && pu.prefs && pu.prefs.cuisines.includes('Catalan'));

  // Skip clears a partial draft.
  w.eval(`(function(){ const u=currentUser(); delete u.prefs; delete u.prefsSkipped; saveStore(); })()`);
  go(w, 'onboarding-prefs'); await sleep(30);
  findChip('Italian').click(); await sleep(10);
  check('Fresh session starts with an empty draft', !isRed(findChip('Catalan')));
  [...w.document.querySelectorAll('#root button')].find(b => /Skip|Omitir|Saltar/.test(b.textContent)).click();
  await sleep(30);
  check('Draft cleared after Skip', w.eval(`window.__mvPrefsDraft`) === null);
  check('prefsSkipped set after Skip', w.eval(`currentUser().prefsSkipped`) === true);

  // A different user must not inherit another user's draft.
  w.eval(`window.__mvPrefsDraft = { userId: 'someone_else', cuisines:['Vegan'], barrios:[], dietary:[] };`);
  w.eval(`(function(){ const u=currentUser(); delete u.prefs; delete u.prefsSkipped; saveStore(); })()`);
  go(w, 'onboarding-prefs'); await sleep(30);
  const vegano = [...w.document.querySelectorAll('#root button')].filter(b => /^(Vegan|Vegano)$/.test(b.textContent.trim()))[0];
  check('Draft from another userId is discarded', !isRed(vegano) && w.eval(`window.__mvPrefsDraft.userId`) === 'u_demo_member');

  check('No runtime errors', w.__e.length === 0, w.__e.join(' | '));

  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
