#!/usr/bin/env node
// ============================================================================
// QA item 8: the demo partner venue (pv_cerveceria) is invisible to real
// members (client clean-slate 23/06) but visible to the demo accounts, so the
// maria <-> owner@cerveceria.test two-account test works; and it is never
// pushed to Supabase.            node demo-venue-check.js index.html
// ============================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const SRC = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

let pass = 0, fail = 0; const out = [];
const check = (n, c, d) => { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (d ? '  → ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SLUG = 'cerveceria-catalana';

function boot({ userId = null, purged = false, extraUsers = [], remoteFeed = null } = {}) {
  const posts = [];
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://www.menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollTo = w.HTMLElement.prototype.scrollTo || function(){};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      const ok = (body) => ({ ok: true, status: 200, json: async () => body });
      w.fetch = (u, o) => {
        u = String(u); const m = (o && o.method) || 'GET';
        if (m === 'POST') { try { posts.push({ url: u, body: JSON.parse(o.body) }); } catch (e) { posts.push({ url: u }); } }
        if (u.includes('/rest/v1/venues') && m === 'GET') return Promise.resolve(ok([]));
        if (u.indexOf('/api/redemptions?venue=') === 0 && remoteFeed) return Promise.resolve(ok(remoteFeed));
        if (u === '/api/redeem') return Promise.resolve(ok({ ok: true }));
        return Promise.reject(new Error('offline'));
      };
      // A browser that already ran the one-time clean-slate purge (production).
      if (purged) w.localStorage.setItem('mv_seed_purged_v1', '1');
      if (userId) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId, expiresAt: Date.now() + 9e11 }));
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const msg = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/i.test(msg)) e.push(msg); });
    } });
  const w = dom.window; w.__posts = posts;
  return w;
}
const visible = w => w.eval(`getAllVenues().some(v => v.slug === '${SLUG}')`);

(async () => {
  // Purged browser, no session: the demo venue was deleted and stays invisible.
  let w = boot({ purged: false });
  await sleep(150);
  check('Fresh browser: one-time purge removes the demo venue', !w.eval(`store.partnerVenues.some(v => v.id === 'pv_cerveceria')`));
  check('Anonymous visitor: demo venue not in Discover/Map', !visible(w));

  // Real (non-demo) member: never sees it.
  w = boot({});
  await sleep(100);
  w.eval(`store.users.push({ id:'u_realmember1', email:'real@example.com', passwordHash:'pwhash:x12345678', role:'MEMBER', createdAt:Date.now(), verifiedAt:Date.now() }); setSession('u_realmember1');`);
  check('Real member: demo venue not visible', !visible(w));
  check('Real member: demo venue not restored into their store', !w.eval(`store.partnerVenues.some(v => v.id === 'pv_cerveceria')`));

  // Demo member (maria) with a session restored on boot.
  const mariaW = boot({ userId: 'u_demo_member' });
  await sleep(250);
  check('Demo member (boot): demo venue restored', mariaW.eval(`store.partnerVenues.some(v => v.id === 'pv_cerveceria' && v.status === 'LIVE')`));
  check('Demo member (boot): demo venue visible in Discover/Map', visible(mariaW));

  // Demo member signing in from the login form.
  w = boot({});
  await sleep(100);
  const who = await w.eval(`(async()=>{ const u = await loginUser({ email:'maria@menuverso.com', password:'member123' }); return u.id; })()`);
  check('Demo member (login): signs in', who === 'u_demo_member', String(who));
  check('Demo member (login): demo venue visible', visible(w));
  w.eval(`logout()`);
  check('After logout: demo venue hidden again', !visible(w));

  // Maria redeems at the demo venue: the push goes to /api/redeem with its slug.
  mariaW.eval(`pushRedemptionToSupabase({ venueSlug: '${SLUG}', memberId: 'u_demo_member', memberName: 'Maria Lopez', dealId: null, dealTitle: '2x1', redeemedAt: Date.now() })`);
  await sleep(150);
  const sent = mariaW.__posts.find(p => p.url === '/api/redeem');
  check('Two-account test: Maria\'s redemption is sent for the demo venue', !!sent && sent.body.venueSlug === SLUG, JSON.stringify(sent && sent.body));

  // Owner on another device: the live feed reads the demo venue's rows.
  const row = { id: 'r1', venue_slug: SLUG, member_id: 'u_demo_member', member_name: 'Maria Lopez', deal_title: '2x1', redeemed_at: new Date().toISOString(), acknowledged_at: null };
  const ownerW = boot({ userId: 'u_demo_partner', remoteFeed: [row] });
  await sleep(250);
  check('Demo partner: owns a venue again after the purge', ownerW.eval(`!!store.partnerVenues.find(v => v.ownerId === 'u_demo_partner')`));
  const rows = await ownerW.eval(`fetchRedemptionsFromSupabase('${SLUG}')`);
  check('Demo partner: live feed receives Maria\'s redemption', Array.isArray(rows) && rows[0] && rows[0].member_name === 'Maria Lopez');

  // Never written to Supabase, by the demo partner or the admin.
  ownerW.eval(`saveStore()`); await sleep(1600);
  check('Demo partner save: demo venue NOT pushed to Supabase', !ownerW.__posts.some(p => p.url.includes('/rest/v1/venues') && p.body && p.body.id === 'pv_cerveceria'));
  const adminW = boot({ userId: 'u_demo_admin' });
  await sleep(250); adminW.eval(`saveStore()`); await sleep(1600);
  check('Admin save: demo venue NOT pushed to Supabase', !adminW.__posts.some(p => p.url.includes('/rest/v1/venues') && p.body && p.body.id === 'pv_cerveceria'));
  // Same browser: Maria restored the demo venue, then the admin signs in.
  // The admin dashboard must keep the clean slate (no demo venue in counts/activity).
  const shared = boot({ userId: 'u_demo_member' });
  await sleep(250);
  shared.eval(`store.redemptions.push({ memberId:'u_demo_member', venueSlug:'${SLUG}', redeemedAt: Date.now(), method:'SLIDE_CONFIRM' }); saveStore(); setSession('u_demo_admin'); go('admin');`);
  await sleep(200);
  const adminTxt = [...shared.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ');
  check('Admin (same browser as Maria): demo venue not restored for admin', shared.eval(`mvIsDemoViewer()`) === false);
  check('Admin overview: no Cervecería in counts or activity', !/Cervecer/i.test(adminTxt), adminTxt.slice(0, 200));

  for (const x of [mariaW, ownerW, adminW, w]) check('No runtime errors', x.__e.length === 0, x.__e.join(' | '));
  console.log(out.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
