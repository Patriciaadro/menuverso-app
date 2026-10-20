#!/usr/bin/env node
// ============================================================================
// QA items 14 + 18: mobile menu panel and real hrefs on nav/footer links.
//   node ui-check.js index.html
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(url) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: url || 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = function(){};
      w.HTMLElement.prototype.scrollIntoView = function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('offline'));
      w.localStorage.setItem('mv_lang_v2', 'es');
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  return dom.window;
}
const click = (w, node, opts) => { const ev = new w.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, opts || {})); node.dispatchEvent(ev); return ev; };

(async () => {
  const w = boot(); await sleep(250);
  // ---- Item 14: mobile menu ----
  const toggle = () => w.document.querySelector('[aria-controls="mv-mmenu"]');
  const menu = () => w.document.getElementById('mv-mmenu');
  check('14: menu toggle exists with aria-controls', !!toggle());
  click(w, toggle()); await sleep(20);
  check('14: tapping the toggle opens the menu', menu() && !menu().classList.contains('hidden'));
  check('14: aria-expanded = true when open', toggle().getAttribute('aria-expanded') === 'true');
  const st = menu().getAttribute('style') || '';
  check('14: panel is opaque (solid cream, no alpha)', /background:\s*#FAF6EE/i.test(st) && !/bg-ink-950\/95/.test(menu().className), st);
  check('14: panel overlays full width (absolute, left/right 0, above content)', /position:\s*absolute/.test(st) && /left:\s*0/.test(st) && /right:\s*0/.test(st) && /z-index:\s*40/.test(st));
  w.eval(`go('privacy')`); await sleep(20);
  check('14: route change closes the menu', !menu() || menu().classList.contains('hidden'));
  w.eval(`go('landing')`); await sleep(20);
  click(w, toggle()); await sleep(10);
  click(w, w.document.querySelector('main') || w.document.body); await sleep(10);
  check('14: tap outside closes the menu', menu().classList.contains('hidden'));
  click(w, toggle()); await sleep(10);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(10);
  check('14: Escape closes the menu', menu().classList.contains('hidden'));
  check('14: aria-expanded back to false', toggle().getAttribute('aria-expanded') === 'false');

  // ---- Item 18: real hrefs ----
  const linkTo = (re) => [...w.document.querySelectorAll('a')].find(a => re.test(a.textContent.trim()));
  const how = linkTo(/^(Cómo funciona|How it works)$/i), pricing = linkTo(/^(Precios|Pricing)$/i), rest = linkTo(/^(Para locales|Para restaurantes|For restaurants)$/i);
  check('18: "Cómo funciona" has href /#how', how && how.getAttribute('href') === '/#how', how && how.getAttribute('href'));
  check('18: "Precios" has href /#precios', pricing && pricing.getAttribute('href') === '/#precios', pricing && pricing.getAttribute('href'));
  check('18: "Para locales" has href /para-locales', rest && rest.getAttribute('href') === '/para-locales', rest && rest.getAttribute('href'));
  const evPlain = click(w, rest); await sleep(20);
  check('18: plain click stays in the SPA (default prevented, route changed)', evPlain.defaultPrevented && w.eval('state.route') === 'partner-landing', w.eval('state.route'));
  w.eval(`go('landing')`); await sleep(20);
  const rest2 = linkTo(/^(Para locales|Para restaurantes|For restaurants)$/i);
  const evMod = click(w, rest2, { metaKey: true }); await sleep(20);
  check('18: Cmd/Ctrl-click is left to the browser (new tab), SPA not triggered', !evMod.defaultPrevented && w.eval('state.route') === 'landing', w.eval('state.route'));

  // Footer links (landing footer)
  const hrefs = [...w.document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  check('18: footer Privacy → /privacidad', hrefs.includes('/privacidad'));
  check('18: footer Terms → /terminos', hrefs.includes('/terminos'));
  const naked = [...w.document.querySelectorAll('header a, footer a')].filter(a => !a.getAttribute('href'));
  check('18: no header/footer link without href', naked.length === 0, naked.map(a => a.textContent.trim()).join(' | '));

  // Direct hits
  const t = boot('https://www.menuverso.com/terminos'); await sleep(200);
  check('18: /terminos opens the Terms page', t.eval('state.route') === 'terms', t.eval('state.route'));
  const pl = boot('https://www.menuverso.com/para-locales'); await sleep(200);
  check('18: /para-locales opens the partner landing', pl.eval('state.route') === 'partner-landing');

  for (const x of [w, t, pl]) check('No runtime errors', x.__e.length === 0, x.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
