// ============================================================================
// Menuverso — DEEP PORTAL INVESTIGATION
// Renders every admin/partner/member screen with realistic data, then CLICKS
// every button on each screen and records anything that throws or errors.
// Also tests the realistic post-clean-slate state (demo partner's venue purged).
// Usage: node deep-portals.js path/to/index.html
// ============================================================================
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const findings = [];
function boot(uid, lang) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {}; w.print = () => {};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('netblock'));
      if (uid) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 }));
      if (lang) w.localStorage.setItem('mv_lang_v2', lang);
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind|netblock/.test(m)) e.push(m); });
    } });
  return dom.window;
}
const ev = (w, r, p) => w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mvRoute: r, mvParams: p || {} } }));

// Rich, realistic store: admin-created LIVE venues + a PENDING (approval flow) +
// a PAUSED, redemptions, reviews, a booking, and a LIVE venue owned by the demo
// partner so the partner portal actually renders.
function seed(w, opts) {
  opts = opts || {};
  const mk = (o) => Object.assign({
    id: o.id, ownerId: o.ownerId || null, slug: o.slug, name: o.name, barrio: 'Eixample', cuisine: 'Drinks',
    priceTier: 2, address: 'Carrer X 1', postcode: '08010', phone: '+34 600 000 000', website: 'https://x.com', instagram: '@x',
    description: 'Nice place', hours: 'Mon-Sun 12-23', photos: [PNG], foodPhotos: [], venuePhotos: [], menuPhotos: [],
    dealTerms: 'terms', dealSlots: [{ id: 's1', label: 'Dinner', timeStart: '19:00', timeEnd: '23:00', active: true, days: ['mon','tue','wed','thu','fri'] }],
    deals: [{ id: 'd1', title: '2×1 cocktails', description: 'buy one get one', active: true, savingsEur: 12, cooldownDays: 7 }],
    liveDeal: { dealSlots: [{ id: 's1', label: 'Dinner', timeStart: '19:00', timeEnd: '23:00', active: true }] },
    rating: 4.5, reviews: 2, lat: 41.39, lng: 2.16, status: o.status || 'LIVE',
    submittedAt: Date.now() - 86400000, approvedAt: Date.now() - 80000000, offerVersion: 1, createdAt: Date.now() - 9e8
  }, o);
  const venues = [
    mk({ id: 'pv_live', slug: 'live-bar', name: 'Live Bar', status: 'LIVE' }),
    mk({ id: 'pv_pending', slug: 'pending-bar', name: 'Pending Bar', status: 'PENDING_APPROVAL', approvedAt: null }),
    mk({ id: 'pv_paused', slug: 'paused-bar', name: 'Paused Bar', status: 'PAUSED' }),
  ];
  if (!opts.partnerHasNoVenue) {
    venues.push(mk({ id: 'pv_cerceveria', ownerId: 'u_demo_partner', slug: 'demo-partner-bar', name: 'Demo Partner Bar', status: 'LIVE' }));
  }
  w.eval('store.partnerVenues = ' + JSON.stringify(venues) + ';');
  w.eval(`store.redemptions = [
    {memberId:"u_demo_member",venueSlug:"live-bar",dealId:"d1",redeemedAt:Date.now()-3*86400000,method:"SLIDE_CONFIRM"},
    {memberId:"u_demo_member",venueSlug:"demo-partner-bar",dealId:"d1",redeemedAt:Date.now()-3600000,method:"SLIDE_CONFIRM"}
  ];`);
  w.eval(`store.reviews = [
    {memberId:"u_demo_member",venueSlug:"live-bar",stars:5,note:"Great",createdAt:Date.now()-2*86400000},
    {memberId:"u_demo_member",venueSlug:"live-bar",stars:1,note:"Flag me",createdAt:Date.now()-1*86400000,flagged:true}
  ];`);
  w.eval(`store.bookings = [
    {id:"b1",memberId:"u_demo_member",venueSlug:"live-bar",dealId:"d1",slot:"Dinner",redeemed:false,createdAt:Date.now()-3600000}
  ];`);
  w.eval('try{ if(Array.isArray(store.changeRequests)) {} else store.changeRequests = []; }catch(e){}');
  w.eval('saveStore();');
}

// Crawl: render a screen, then click every button on it (re-rendering between
// clicks so each click hits a fresh screen), recording any thrown/window error.
function crawl(label, uid, route, params, opts) {
  const w = boot(uid);
  seed(w, opts);
  const errs = [];
  const renav = () => {
    try { w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 })); } catch(e){}
    w.__e.length = 0;
    try { ev(w, route, params); } catch (e) { errs.push('RENDER threw: ' + e.message); }
    w.__e.forEach(e => errs.push('RENDER error: ' + e));
    w.__e.length = 0;
  };
  renav();
  const total = w.document.querySelectorAll('#root button, #root [role="button"]').length;
  for (let i = 0; i < total; i++) {
    renav();
    const btns = w.document.querySelectorAll('#root button, #root [role="button"]');
    const b = btns[i]; if (!b) continue;
    const lbl = (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) || '(no label)';
    try { b.click(); } catch (e) { errs.push('CLICK "' + lbl + '" threw: ' + e.message); }
    w.__e.forEach(e => errs.push('CLICK "' + lbl + '": ' + e));
    w.__e.length = 0;
  }
  return { label, buttons: total, errs: [...new Set(errs)] };
}

const screens = [
  // ADMIN tabs
  ['ADMIN overview', 'u_demo_admin', 'admin', { tab: 'overview' }],
  ['ADMIN partners', 'u_demo_admin', 'admin', { tab: 'partners' }],
  ['ADMIN requests', 'u_demo_admin', 'admin', { tab: 'requests' }],
  ['ADMIN users',    'u_demo_admin', 'admin', { tab: 'users' }],
  ['ADMIN activity', 'u_demo_admin', 'admin', { tab: 'activity' }],
  ['ADMIN insights', 'u_demo_admin', 'admin', { tab: 'insights' }],
  ['ADMIN reviews',  'u_demo_admin', 'admin', { tab: 'reviews' }],
  ['ADMIN messages', 'u_demo_admin', 'admin', { tab: 'messages' }],
  ['ADMIN notes',    'u_demo_admin', 'admin', { tab: 'notes' }],
  ['ADMIN audit',    'u_demo_admin', 'admin', { tab: 'audit' }],
  ['ADMIN system',   'u_demo_admin', 'admin', { tab: 'system' }],
  // PARTNER tabs (demo partner owns a LIVE venue here)
  ['PARTNER overview', 'u_demo_partner', 'partner-portal', { tab: 'overview' }],
  ['PARTNER redeem',   'u_demo_partner', 'partner-portal', { tab: 'redeem' }],
  ['PARTNER clientes', 'u_demo_partner', 'partner-portal', { tab: 'clientes' }],
  ['PARTNER ofertas',  'u_demo_partner', 'partner-portal', { tab: 'ofertas' }],
  ['PARTNER profile',  'u_demo_partner', 'partner-portal', { tab: 'profile' }],
  // MEMBER screens
  ['MEMBER discover',  'u_demo_member', 'app', {}],
  ['MEMBER bookings',  'u_demo_member', 'bookings', {}],
  ['MEMBER profile',   'u_demo_member', 'profile', {}],
  ['MEMBER venue',     'u_demo_member', 'venue', { slug: 'live-bar' }],
];

console.log('\n=============== DEEP PORTAL INVESTIGATION ===============');
let totalErrs = 0;
for (const [label, uid, route, params] of screens) {
  let r;
  try { r = crawl(label, uid, route, params); }
  catch (e) { console.log('\n■ ' + label + '\n   HARNESS-THREW: ' + e.message); totalErrs++; continue; }
  const status = r.errs.length ? ('✗ ' + r.errs.length + ' issue(s)') : '✓ clean';
  console.log('\n■ ' + label + '  [' + r.buttons + ' controls]  ' + status);
  r.errs.slice(0, 12).forEach(e => { console.log('     • ' + e); });
  totalErrs += r.errs.length;
}

// Special: realistic clean-slate state — demo partner's venue was purged.
console.log('\n■ PARTNER (clean-slate: demo partner has NO venue)');
{
  const w = boot('u_demo_partner');
  seed(w, { partnerHasNoVenue: true });
  w.__e.length = 0;
  try { ev(w, 'partner-portal', { tab: 'overview' }); } catch (e) { console.log('   RENDER threw: ' + e.message); }
  const t = (w.document.getElementById('root').textContent || '').trim().slice(0, 80);
  console.log('   route after render: ' + (w.eval('state.route')) + '   | errors: ' + (w.__e.filter(e=>!/tailwind|netblock/.test(e)).length));
  console.log('   note: PartnerPortal redirects no-venue partners to partner-onboarding (not a crash, but the demo partner can no longer reach their portal).');
}

console.log('\n--------------------------------------------------------');
console.log('TOTAL ISSUES FLAGGED: ' + totalErrs);
console.log('(headless: catches JS errors/throws + redirect behavior; not visual/CSS)');
console.log('========================================================');
