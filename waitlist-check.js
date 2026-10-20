#!/usr/bin/env node
// ============================================================================
// QA item 15: waitlist double opt-in. The form must go through /api/waitlist
// (row + hashed token + Resend email), only promise an email when one was
// sent, and never lose a signup when the function is unavailable.
//   node waitlist-check.js index.html
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function boot(apiMode) {
  const calls = [];
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/unete',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.localStorage.setItem('mv_lang_v2', 'es');
      w.fetch = (u, o) => {
        u = String(u); calls.push(u);
        if (u === '/api/waitlist') {
          if (apiMode === 'emailed') return Promise.resolve(res(200, { ok: true, emailed: true }));
          if (apiMode === 'saved') return Promise.resolve(res(200, { ok: true, emailed: false }));
          if (apiMode === 'down') return Promise.resolve(res(500, { error: 'server_not_configured' }));
          if (apiMode === 'consent') return Promise.resolve(res(400, { error: 'consent_required' }));
          return Promise.reject(new Error('network'));
        }
        if (u.includes('/rest/v1/launch_waitlist')) return Promise.resolve(res(201, null));
        return Promise.reject(new Error('offline'));
      };
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  dom.window.__calls = calls;
  return dom.window;
}
const vis = w => [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ').replace(/\s+/g, ' ');
async function submit(w, email) {
  const form = w.document.querySelector('form');
  form.querySelector('input[type=email]').value = email;
  const cb = form.querySelector('input[name=consent]'); if (cb) cb.checked = true;
  form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(150);
}

(async () => {
  let w = boot('emailed'); await sleep(200); await submit(w, 'ana@example.com');
  check('A: goes through /api/waitlist', w.__calls.includes('/api/waitlist'));
  check('A: emailed → asks to confirm via the link', /Revisa tu correo y confirma/.test(vis(w)), vis(w).slice(0, 200));
  check('A: no direct anon insert when the function worked', !w.__calls.some(u => u.includes('/rest/v1/launch_waitlist')));

  w = boot('saved'); await sleep(200); await submit(w, 'ana@example.com');
  check('B: saved but not emailed → success without promising an email', /Estás dentro|Ya estás en la lista|Te avisaremos/.test(vis(w)) && !/Revisa tu correo/.test(vis(w)), vis(w).slice(0, 200));

  w = boot('down'); await sleep(200); await submit(w, 'ana@example.com');
  check('C: function down (500) → falls back to the direct insert', w.__calls.some(u => u.includes('/rest/v1/launch_waitlist')));
  check('C: success shown, no email promised', /Estás dentro|Ya estás en la lista|Te avisaremos/.test(vis(w)) && !/Revisa tu correo/.test(vis(w)));

  w = boot('network'); await sleep(200); await submit(w, 'ana@example.com');
  check('D: network error → falls back to the direct insert', w.__calls.some(u => u.includes('/rest/v1/launch_waitlist')));

  w = boot('consent'); await sleep(200); await submit(w, 'ana@example.com');
  check('E: server consent rejection shows the consent error', /Debes aceptar/.test(vis(w)));

  // ---- Server function ----
  const fnPath = path.join(path.dirname(path.resolve(process.argv[2] || 'index.html')), 'api', 'waitlist.js');
  async function runFn(mode) {
    process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.RESEND_API_KEY = 're_test';
    delete require.cache[fnPath];
    const seen = [];
    global.fetch = async (u, o) => {
      u = String(u); seen.push(u);
      if (u.includes('launch_waitlist')) return res(mode === 'upsertFail' ? 400 : 201, null);
      if (u.includes('waitlist_confirmations')) return res(mode === 'tokenFail' ? 404 : 201, null);
      if (u.includes('api.resend.com')) return res(200, { id: 'e1' });
      return res(404, null);
    };
    const handler = require(fnPath);
    let status = 0, body = null;
    await handler({ method: 'POST', headers: {}, body: { email: 'ana@example.com', consent: true } },
      { status(s) { status = s; return this; }, json(b) { body = b; return this; }, setHeader() {} });
    return { status, body, seen };
  }
  let r = await runFn('ok');
  check('Fn: happy path → 200, emailed', r.status === 200 && r.body && r.body.emailed === true, JSON.stringify(r.body));
  r = await runFn('upsertFail');
  check('Fn: failed row insert → 502 (client falls back), no email', r.status === 502 && !r.seen.some(u => u.includes('resend')), r.status + ' ' + JSON.stringify(r.body));
  r = await runFn('tokenFail');
  check('Fn: token not stored → 200 but no email with a dead link', r.status === 200 && r.body.emailed === false && !r.seen.some(u => u.includes('resend')), JSON.stringify(r.body));

  check('No runtime errors', w.__e.length === 0, w.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
