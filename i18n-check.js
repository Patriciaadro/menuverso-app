#!/usr/bin/env node
// ============================================================================
// QA items 11–13: deal-aware "applied" label, Spanish slot labels, and the
// strings the QA pass found in English with MV_LANG = 'es'.
//   node i18n-check.js index.html
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(lang) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      w.localStorage.setItem('mv_lang_v2', lang);
      w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: 'u_demo_member', expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const vis = w => [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ').replace(/\s+/g, ' ');
const has = (w, fn) => w.eval(`typeof ${fn} === 'function'`);

(async () => {
  const es = boot('es'); await sleep(300);

  // Item 11
  if (has(es, 'mvAppliedLabel')) {
    check('11: 2×1 deal → "2×1 aplicado"', es.eval(`mvAppliedLabel('2×1 en el menú principal', true)`) === '2×1 aplicado');
    check('11: "2x1" spelled with x also counts', es.eval(`mvAppliedLabel('2x1 en cañas', true)`) === '2×1 aplicado');
    check('11: Café gratis → "Oferta aplicada"', es.eval(`mvAppliedLabel('Café gratis', true)`) === 'Oferta aplicada');
    check('11: English: "Offer applied"', es.eval(`mvAppliedLabel('€10 off two menus', false)`) === 'Offer applied');
  } else check('11: mvAppliedLabel exists', false);

  // Item 12
  if (has(es, 'localizeSlot')) {
    check('12: ES slot label translated, times kept', es.eval(`localizeSlot('Weekday Lunch · 07:00-21:00')`) === 'Comida entre semana · 07:00-21:00', es.eval(`localizeSlot('Weekday Lunch · 07:00-21:00')`));
    check('12: partner-typed label left as is', es.eval(`localizeSlot('Menú del día · 13:00-16:00')`) === 'Menú del día · 13:00-16:00');
    const en = boot('en'); await sleep(300);
    check('12: EN unchanged', en.eval(`localizeSlot('Early Dinner · 19:30-21:30')`) === 'Early Dinner · 19:30-21:30');
  } else check('12: localizeSlot exists', false);

  // Item 13: screens
  es.eval(`delete currentUser().prefs; delete currentUser().prefsSkipped; go('onboarding-prefs')`); await sleep(200);
  const onb = vis(es);
  check('13: onboarding headline fully Spanish (no "Help us personalizar")', /Ayúdanos a personalizar tu feed/.test(onb) && !/Help us/.test(onb), onb.slice(0, 200));
  check('13: onboarding greeting in Spanish', !/Welcome, /.test(onb));
  es.eval(`go('profile')`); await sleep(200);
  const prof = vis(es);
  const left = ['Member since', 'Renews', 'Tell us your taste', 'TELL US YOUR TASTE', 'set up →', 'Explorer', 'Connoisseur', 'Legend'].filter(s => prof.includes(s));
  check('13: profile has none of the QA-listed English strings', left.length === 0, left.join(', '));
  check('13: profile shows "Miembro desde"', /Miembro desde/.test(prof));

  // Item 13: toasts
  ['Signed out', 'Welcome back, Ana', 'Signing in…', 'Pick at least one cuisine.', 'Your feed is ready', 'Map unavailable'].forEach(m => es.eval(`toast(${JSON.stringify(m)})`));
  await sleep(50);
  const toasts = [...es.document.querySelectorAll('#mv-toast-container .toast')].map(t => t.textContent.trim());
  const englishToasts = toasts.filter(t => /Signed out|Welcome back|Signing in|Pick at least|Your feed is ready|Map unavailable/.test(t));
  check('13: toasts translated', englishToasts.length === 0, englishToasts.join(' | '));

  // Item 11 on the partner side: tapping a live redemption shows the deal that
  // was actually redeemed, with the deal-aware label, and doesn't throw.
  const dom2 = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      w.localStorage.setItem('mv_lang_v2', 'es');
      w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: 'u_demo_partner', expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  const p = dom2.window; await sleep(300);
  p.eval(`(function(){ const pv = store.partnerVenues.find(v => v.ownerId === 'u_demo_partner');
    pv.deals = [{ id:'d_2x1', title:'2×1 en el menú', active:true }, { id:'d_cafe', title:'Café gratis', active:true }];
    store.redemptions.push({ memberId:'u_demo_member', venueSlug: pv.slug, dealId:'d_cafe', redeemedAt: Date.now(), method:'SLIDE_CONFIRM' });
    saveStore(); go('partner-portal', { tab:'redeem' }); })()`);
  await sleep(300);
  const ackBtn = [...p.document.querySelectorAll('button')].find(b => /^\s*(Reconocer|Acknowledge)\s*$/i.test(b.textContent));
  check('11 (partner): live feed shows a confirm button for the redemption', !!ackBtn);
  if (ackBtn) { ackBtn.click(); await sleep(200); }
  const ptxt = vis(p);
  check('11 (partner): ticket says "Oferta aplicada" for Café gratis', /Oferta aplicada/i.test(ptxt) && /Café gratis/i.test(ptxt), ptxt.slice(0, 240));
  check('11 (partner): no runtime errors', p.__e.length === 0, p.__e.join(' | '));

  check('No runtime errors', es.__e.length === 0, es.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
