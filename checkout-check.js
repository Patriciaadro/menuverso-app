#!/usr/bin/env node
// ============================================================================
// QA item 10: no client-side "free membership". With MV_PAYMENTS_ENABLED false,
// checkout shows the waitlist and nothing sets a subscription ACTIVE.
//   node checkout-check.js index.html
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(userId) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      if (userId) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const txt = w => [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ').replace(/\s+/g, ' ');
const btn = (w, re) => [...w.document.querySelectorAll('button')].find(b => re.test(b.textContent));

(async () => {
  const w = boot(null);
  await sleep(150);
  check('Payments flag is off', w.eval("typeof MV_PAYMENTS_ENABLED !== 'undefined' && MV_PAYMENTS_ENABLED === false") === true);

  // New member, no subscription
  w.eval(`store.users.push({ id:'u_newmember1', email:'new@example.com', passwordHash:'pwhash:x12345678', firstName:'Ana', role:'MEMBER', createdAt:Date.now(), verifiedAt:Date.now(), prefs:{cuisines:['Tapas'],barrios:[],dietary:[]} }); setSession('u_newmember1');`);
  w.eval(`go('checkout')`); await sleep(100);
  check('Checkout shows the "memberships open in Winter 2026" screen', /SUSCRIPCIONES ABREN|MEMBERSHIPS OPEN/.test(txt(w)), txt(w).slice(0, 200));
  check('Checkout embeds the waitlist email form', !!w.document.querySelector('input[type=email]'));
  check('No plan / pay buttons on checkout', !btn(w, /Suscrib|Subscribe|Pagar|Pay|Activar|Start/i));
  const anyActive = () => w.eval(`!!(store.subscriptions['u_newmember1'] && store.subscriptions['u_newmember1'].status === 'ACTIVE')`);
  for (const b of [...w.document.querySelectorAll('button')]) { try { b.click(); } catch (e) {} await sleep(20); w.eval(`if (state.route !== 'checkout') go('checkout')`); }
  check('Clicking everything on checkout never activates a subscription', !anyActive());

  // Redeem path without subscription lands on the waitlist screen
  w.eval(`setSession('u_newmember1'); bookSlot({ slug:'x', name:'X', deals:[] }, { id:'s1', label:'Lunch', timeStart:'13:00', timeEnd:'16:00', active:true })`); await sleep(100);
  check('Redeem without subscription → checkout waitlist screen', w.eval('state.route') === 'checkout' && /SUSCRIPCIONES ABREN|MEMBERSHIPS OPEN/.test(txt(w)), w.eval('state.route'));

  // After onboarding: browse the app instead of a dead-end checkout
  check('Post-onboarding route is the app while payments are off', w.eval("typeof mvPostOnboardingRoute === 'function' ? mvPostOnboardingRoute() : (hasSub() ? 'app' : 'checkout')") === 'app');

  // Landing CTA goes to the waitlist
  w.eval(`go('landing')`); await sleep(100);
  const cta = btn(w, /Únete a la lista|Join the waitlist/);
  check('Landing membership CTA reads "Únete a la lista / Join the waitlist"', !!cta);
  if (cta) { cta.click(); await sleep(50); }
  check('Landing CTA opens the waitlist page', w.eval('state.route') === 'unete', w.eval('state.route'));
  check('No "Hazte miembro" CTA left on the landing page', (w.eval(`go('landing'), 1`), !/Hazte miembro|Get Your Pass/.test(txt(w))));

  // Existing subscriber (demo member) unaffected
  const m = boot('u_demo_member'); await sleep(150);
  check('Existing ACTIVE subscriber still has a subscription', m.eval('hasSub()') === true);
  m.eval(`go('checkout')`); await sleep(50);
  check('Existing subscriber sees "already subscribed", not the waitlist', /already subscribed|ya tienes|Ya estás suscrit/i.test(txt(m)), txt(m).slice(0, 160));

  for (const x of [w, m]) check('No runtime errors', x.__e.length === 0, x.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
