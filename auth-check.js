#!/usr/bin/env node
// ============================================================================
// QA item 6: Supabase Auth readiness, with MV_USE_SUPABASE_AUTH forced ON and a
// mocked supabase-js client.   node auth-check.js index.html
// Covers the links Supabase emails (sign-up confirmation, password reset) landing
// on /confirmar, the reset form, local-account fallback, and the redirect URLs.
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const RAW = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const SRC_ON = RAW.replace('const MV_USE_SUPABASE_AUTH = false;', 'const MV_USE_SUPABASE_AUTH = true;');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(url, { src = SRC_ON, auth = {}, apiConfirm } = {}) {
  const calls = [];
  const dom = new JSDOM(src, { runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = (u) => {
        u = String(u);
        if (u.indexOf('/api/confirm') === 0 && apiConfirm) return Promise.resolve({ ok: true, status: 200, json: async () => apiConfirm });
        return Promise.reject(new Error('offline'));
      };
      const A = Object.assign({
        exchangeCodeForSession: async (c) => { calls.push(['exchange', c]); return { data: { session: { user: { email: 'nueva@example.com' } } }, error: null }; },
        setSession: async (s) => { calls.push(['setSession', s.access_token]); return { data: { session: { user: { email: 'nueva@example.com' } } }, error: null }; },
        updateUser: async (p) => { calls.push(['updateUser', p.password]); return { data: {}, error: null }; },
        signOut: async () => { calls.push(['signOut']); return { error: null }; },
        signUp: async (p) => { calls.push(['signUp', p.options && p.options.emailRedirectTo]); return { data: {}, error: null }; },
        signInWithPassword: async () => { calls.push(['signIn']); return { data: null, error: { message: 'Invalid login credentials' } }; },
        resetPasswordForEmail: async (e, o) => { calls.push(['reset', o && o.redirectTo]); return { data: null, error: { message: 'rate limited' } }; },
      }, auth);
      w.supabase = { createClient: () => ({ auth: A, channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){} }) };
      const e = []; w.__e = e; w.__toasts = [];
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(m)) e.push(m); });
    } });
  dom.window.__calls = calls;
  return dom.window;
}
const text = w => (w.document.querySelector('#root') || w.document.body).textContent.replace(/\s+/g, ' ');

(async () => {
  // 1. Sign-up confirmation, PKCE (?code=)
  let w = boot('https://www.menuverso.com/confirmar?type=signup&code=abc123');
  await sleep(300);
  check('Signup (PKCE): code exchanged', w.__calls.some(c => c[0] === 'exchange' && c[1] === 'abc123'));
  check('Signup (PKCE): shows "Cuenta confirmada", not "Enlace no válido"', /Cuenta confirmada|Account confirmed/.test(text(w)) && !/no válido|Invalid link/.test(text(w)), text(w).slice(0, 160));
  check('Signup (PKCE): code removed from the address bar', !/code=/.test(w.location.href), w.location.href);

  // 2. Sign-up confirmation, implicit (#access_token=)
  w = boot('https://www.menuverso.com/confirmar#access_token=AT&refresh_token=RT&type=signup');
  await sleep(300);
  check('Signup (implicit): session set from fragment', w.__calls.some(c => c[0] === 'setSession' && c[1] === 'AT'));
  check('Signup (implicit): confirmed screen', /Cuenta confirmada|Account confirmed/.test(text(w)));
  check('Signup (implicit): tokens removed from the URL', !/access_token/.test(w.location.href), w.location.href);

  // 3. Expired link
  w = boot('https://www.menuverso.com/confirmar?type=signup#error=access_denied&error_code=otp_expired');
  await sleep(300);
  check('Expired link: "Enlace caducado"', /caducado|expired/i.test(text(w)), text(w).slice(0, 160));

  // 4. Opened on another device: session can't be opened, account still confirmed
  w = boot('https://www.menuverso.com/confirmar?type=signup&code=zzz', { auth: { exchangeCodeForSession: async () => ({ data: { session: null }, error: { message: 'code verifier not found' } }) } });
  await sleep(300);
  check('Signup on another device: still shows confirmed', /Cuenta confirmada|Account confirmed/.test(text(w)));

  // 5. Password reset: form, mismatch, success
  w = boot('https://www.menuverso.com/confirmar?type=recovery&code=rec1');
  await sleep(300);
  const pws = w.document.querySelectorAll('input[type=password]');
  check('Reset: new-password form shown (2 fields)', pws.length === 2, String(pws.length));
  if (pws.length === 2) {
    pws[0].value = 'nuevaClave1'; pws[1].value = 'otraCosa22';
    w.document.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(100);
    check('Reset: mismatched passwords are not saved', !w.__calls.some(c => c[0] === 'updateUser'));
    pws[1].value = 'nuevaClave1';
    w.document.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(300);
    check('Reset: updateUser called with the new password', w.__calls.some(c => c[0] === 'updateUser' && c[1] === 'nuevaClave1'));
    check('Reset: success screen', /Contraseña actualizada|Password updated/.test(text(w)), text(w).slice(0, 160));
  }

  // 6. Reset link opened where the session can't be established
  w = boot('https://www.menuverso.com/confirmar?type=recovery&code=bad', { auth: { exchangeCodeForSession: async () => ({ data: { session: null }, error: { message: 'invalid' } }) } });
  await sleep(300);
  check('Reset without session: clear error, no form', /mismo navegador|same browser/.test(text(w)) && w.document.querySelectorAll('input[type=password]').length === 0);

  // 7. Our own ?token= links (waitlist / legacy member) still use /api/confirm
  w = boot('https://www.menuverso.com/confirmar?token=tok123', { apiConfirm: { kind: 'waitlist' } });
  await sleep(300);
  check('Legacy ?token= flow unchanged', /Estás dentro|You're in/.test(text(w)) && !w.__calls.some(c => c[0] === 'exchange'), text(w).slice(0, 120));

  // 8. Login: local-account fallback when Supabase says invalid credentials
  w = boot('https://www.menuverso.com/');
  await sleep(200);
  const r1 = await w.eval(`(async()=>{ store.users.push({ id:'u_old123456', email:'antigua@example.com', passwordHash: await hashPassword('localPass1'), role:'MEMBER', createdAt:Date.now(), verifiedAt:Date.now() }); saveStore();
    try { const u = await loginUser({ email:'antigua@example.com', password:'localPass1' }); return u && u.id; } catch(e) { return 'ERR ' + e.message; } })()`);
  check('Login: pre-flip local account still signs in', r1 === 'u_old123456', String(r1));
  const r2 = await w.eval(`(async()=>{ try { await loginUser({ email:'antigua@example.com', password:'wrongPass9' }); return 'logged in'; } catch(e) { return e.message; } })()`);
  check('Login: wrong password still rejected', /wrong/i.test(String(r2)), String(r2));
  const r3 = await w.eval(`(async()=>{ try { await loginUser({ email:'nadie@example.com', password:'whatever1' }); return 'logged in'; } catch(e) { return e.message; } })()`);
  check('Login: unknown email rejected', /wrong/i.test(String(r3)), String(r3));

  // 9. Sign-up sends users back to /confirmar?type=signup
  await w.eval(`(async()=>{ try { await registerUser({ email:'nueva@example.com', password:'claveSegura1', firstName:'Ana', lastName:'P', role:'MEMBER' }); } catch(e) {} })()`);
  check('Sign-up: emailRedirectTo = /confirmar?type=signup', w.__calls.some(c => c[0] === 'signUp' && /\/confirmar\?type=signup$/.test(c[1] || '')), JSON.stringify(w.__calls.filter(c => c[0] === 'signUp')));

  // 10. Flag OFF: behaviour unchanged (local accounts, no Supabase calls)
  w = boot('https://www.menuverso.com/', { src: RAW });
  await sleep(200);
  const r4 = await w.eval(`(async()=>{ try { const u = await loginUser({ email:'maria@menuverso.com', password:'member123' }); return u && u.id; } catch(e) { return 'ERR ' + e.message; } })()`);
  check('Flag off: demo member logs in locally', r4 === 'u_demo_member', String(r4));
  check('Flag off: no Supabase Auth calls', !w.__calls.some(c => ['signIn','signUp','exchange'].includes(c[0])));

  for (const x of [w]) check('No runtime errors', x.__e.length === 0, x.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
