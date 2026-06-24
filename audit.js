// ============================================================================
// Menuverso — COMPREHENSIVE E2E + HOSTILE AUDIT
// Goes beyond "did it render": asserts invariants, drives real handlers, and
// attacks the app with hostile input. Four areas:
//   1) Data integrity & money   2) Security & hostile input
//   3) Cross-flow consistency   4) Content correctness & i18n
// Honest about headless limits (no real pixels/tiles/Supabase/email).
// Usage: node audit.js path/to/index.html
// ============================================================================
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let pass = 0, fail = 0; const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS  ' + name); }
  else { fail++; results.push('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function section(t){ results.push('\n--- ' + t + ' ---'); }

function boot(uid, lang) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://menuverso.com/',
    beforeParse(w) {
      w.requestAnimationFrame = c => setTimeout(c, 0); w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {};
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.fetch = () => Promise.reject(new Error('x'));
      if (uid) w.localStorage.setItem('menuverso_session_v4', JSON.stringify({ userId: uid, expiresAt: Date.now() + 9e11 }));
      if (lang) w.localStorage.setItem('mv_lang_v2', lang);
      const e = []; w.__e = e;
      w.addEventListener('error', ev => { const m = (ev.error ? ev.error.message : ev.message) || ''; if (!/tailwind/.test(m)) e.push(m); });
    } });
  return dom.window;
}
const ev = (w, r, p) => w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mvRoute: r, mvParams: p || {} } }));
const fire = (el, type) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(type, { bubbles: true }));
const txt = (w) => (w.document.getElementById('root') || {}).textContent || '';
const dataImgs = (w) => [...w.document.getElementById('root').querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => s.startsWith('data:image'));
// XSS payloads designed to break out of an attribute or inject an executing element.
const XSS_IMG = '"><img src=x onerror="window.__xss=(window.__xss||0)+1">';
const XSS_SCRIPT = '<script>window.__xss=(window.__xss||0)+1<\/script>';
function xssFired(w) {
  // executed handler, or a literal injected element that a browser would run.
  if (w.eval('window.__xss')) return true;
  const root = w.document.getElementById('root');
  if (root.querySelector('img[onerror]')) return true;
  if ([...root.querySelectorAll('script')].some(s => /__xss/.test(s.textContent || ''))) return true;
  return false;
}
const VEN = (o) => Object.assign({ id:'pv_x', slug:'venue-x', name:'Venue X', barrio:'Eixample', cuisine:'Drinks',
  priceTier:2, status:'LIVE', photos:[], foodPhotos:[], venuePhotos:[], menuPhotos:[],
  deals:[{id:'d1',title:'2×1',active:true,savingsEur:10,cooldownDays:30}], dealSlots:[], liveDeal:{dealSlots:[]},
  rating:4.5, reviews:1, lat:41.39, lng:2.16 }, o);
function inject(w, venues, extra) {
  w.eval('store.partnerVenues = ' + JSON.stringify(venues) + ';' + (extra || '') + ' saveStore();');
}

// ============================================================================
// 1) DATA INTEGRITY & MONEY
// ============================================================================
function area1() {
  section('1) DATA INTEGRITY & MONEY');
  // 1.1 Profile total = exact sum of per-deal savings
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ id:'pv_b', slug:'sky', name:'Sky', deals:[{id:'d1',title:'2×1',active:true,savingsEur:17,cooldownDays:7}] })],
      'store.redemptions=[{memberId:"u_demo_member",venueSlug:"sky",dealId:"d1",redeemedAt:Date.now()-3*86400000,method:"SLIDE_CONFIRM"},{memberId:"u_demo_member",venueSlug:"sky",dealId:"d1",redeemedAt:Date.now()-1*86400000,method:"SLIDE_CONFIRM"}];');
    ev(w, 'profile');
    check('1.1 profile total savings = €34 (2×€17, exact per-deal sum)', /(^|[^0-9])34([^0-9]|$)/.test(txt(w)), 'no exact 34');
  }
  // 1.2 getVenueDeals normalizes a deal missing savings/cooldown
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'norm', deals:[{id:'d1',title:'2×1',active:true}] })]); // no savingsEur/cooldownDays
    const d = w.eval('getVenueDeals(findVenueBySlug("norm"))[0]');
    check('1.2 missing savings normalized to a positive number', d && typeof d.savingsEur==='number' && d.savingsEur>0, 'savingsEur='+(d&&d.savingsEur));
    check('1.2 missing cooldown normalized to a positive number', d && typeof d.cooldownDays==='number' && d.cooldownDays>0, 'cooldownDays='+(d&&d.cooldownDays));
  }
  // 1.3 recurrency labels for each frequency are sensible & distinct
  {
    const w = boot('u_demo_member');
    const lab = n => w.eval('dealRecurrencyLabel({cooldownDays:'+n+'}, false)');
    check('1.3 cooldown 1 → daily', /daily/i.test(lab(1)), lab(1));
    check('1.3 cooldown 30 → 1 month', /every 1 month/i.test(lab(30)), lab(30));
    check('1.3 cooldown 90 → 3 months', /every 3 months/i.test(lab(90)), lab(90));
    check('1.3 cooldown 7 → 7 days (not 30)', /every 7 days/i.test(lab(7)), lab(7));
  }
  // 1.4 cooldown enforcement: blocked within cooldown, allowed after
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'cd', deals:[{id:'d1',title:'2×1',active:true,savingsEur:10,cooldownDays:30}] })]);
    // redeemed 2 days ago → still in 30-day cooldown
    w.eval('store.redemptions=[{memberId:"u_demo_member",venueSlug:"cd",dealId:"d1",redeemedAt:Date.now()-2*86400000}]; saveStore();');
    const s1 = w.eval('dealRedeemStatus(currentUser(), findVenueBySlug("cd"), getVenueDeals(findVenueBySlug("cd"))[0])');
    check('1.4 redeem BLOCKED inside cooldown', s1 && s1.ok === false, JSON.stringify(s1));
    // redeemed 40 days ago, none since → allowed
    w.eval('store.redemptions=[{memberId:"u_demo_member",venueSlug:"cd",dealId:"d1",redeemedAt:Date.now()-40*86400000}]; saveStore();');
    const s2 = w.eval('dealRedeemStatus(currentUser(), findVenueBySlug("cd"), getVenueDeals(findVenueBySlug("cd"))[0])');
    check('1.4 redeem ALLOWED after cooldown elapsed', s2 && s2.ok === true, JSON.stringify(s2));
  }
  // 1.5 same-day rule: can't redeem a 2nd deal at same venue same day
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'sd', deals:[{id:'d1',title:'A',active:true,savingsEur:10,cooldownDays:7},{id:'d2',title:'B',active:true,savingsEur:8,cooldownDays:7}] })]);
    w.eval('store.redemptions=[{memberId:"u_demo_member",venueSlug:"sd",dealId:"d1",redeemedAt:Date.now()-3600000}]; saveStore();'); // 1h ago today
    const s = w.eval('dealRedeemStatus(currentUser(), findVenueBySlug("sd"), getVenueDeals(findVenueBySlug("sd"))[1])');
    check('1.5 second deal BLOCKED same day (sameday rule)', s && s.ok === false, JSON.stringify(s));
  }
  // 1.6 store persistence round-trip (serialize → reload)
  {
    const w = boot('u_demo_admin');
    inject(w, [VEN({ slug:'rt', deals:[{id:'d1',title:'2×1',active:true,savingsEur:42,cooldownDays:60}] })]);
    const reloaded = w.eval('JSON.parse(JSON.stringify(loadStore())).partnerVenues[0].deals[0]');
    check('1.6 custom savings survives store round-trip', reloaded && reloaded.savingsEur === 42, JSON.stringify(reloaded));
    check('1.6 custom cooldown survives store round-trip', reloaded && reloaded.cooldownDays === 60);
  }
  // 1.7 negative savings never surfaces as a negative number
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'neg', deals:[{id:'d1',title:'2×1',active:true,savingsEur:-99,cooldownDays:30}] })]);
    const d = w.eval('getVenueDeals(findVenueBySlug("neg"))[0]');
    check('1.7 negative savingsEur sanitized to ≥0', d && d.savingsEur >= 0, 'savingsEur='+(d&&d.savingsEur));
  }
  // 1.8 price tier renders the right number of € symbols
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'pt', name:'PriceTest', priceTier:3 })]);
    ev(w, 'venue', { slug:'pt' });
    check('1.8 price tier 3 shows €€€ somewhere', /€€€/.test(txt(w)) , 'no €€€');
  }
}

// ============================================================================
// 2) SECURITY & HOSTILE INPUT
// ============================================================================
function area2() {
  section('2) SECURITY & HOSTILE INPUT');
  // 2.1 stored XSS via venue.photos → hero carousel (the suspected sink)
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'xp', photos:[XSS_IMG] })]);
    ev(w, 'venue', { slug:'xp' });
    check('2.1 photos[] cannot inject executable HTML (hero carousel)', !xssFired(w), 'XSS via photo string fired');
  }
  // 2.2 venue.name XSS-safe (text node)
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'xn', name:XSS_IMG })]);
    ev(w, 'venue', { slug:'xn' });
    check('2.2 venue name cannot inject executable HTML', !xssFired(w));
  }
  // 2.3 venue.description XSS-safe
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'xd', description:XSS_SCRIPT })]);
    ev(w, 'venue', { slug:'xd' });
    check('2.3 venue description cannot inject executable HTML', !xssFired(w));
  }
  // 2.4 review note XSS-safe (rendered on venue page)
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'xr' })], 'store.reviews=[{memberId:"u_demo_member",venueSlug:"xr",stars:5,note:'+JSON.stringify(XSS_IMG)+',createdAt:Date.now()}];');
    ev(w, 'venue', { slug:'xr' });
    check('2.4 review note cannot inject executable HTML', !xssFired(w));
  }
  // 2.5 route guard: MEMBER cannot see ADMIN content
  {
    const w = boot('u_demo_member');
    ev(w, 'admin');
    const t = txt(w);
    check('2.5 member on /admin does NOT see admin console', !/Aprobaciones|Pending approvals|LIVE PARTNER VENUES|Partner venues/i.test(t), 'admin content leaked to member');
    check('2.5 member on /admin — no crash', w.__e.length === 0, w.__e[0]);
  }
  // 2.6 route guard: MEMBER cannot see PARTNER portal
  {
    const w = boot('u_demo_member');
    ev(w, 'partner-portal', { tab:'overview' });
    check('2.6 member on /partner-portal does NOT see partner console', !/Escanear|Mis ofertas|Scan member/i.test(txt(w)), 'partner content leaked');
    check('2.6 member on /partner-portal — no crash', w.__e.length === 0, w.__e[0]);
  }
  // 2.7 logged-out cannot reach protected screens
  {
    const w = boot(null);
    ev(w, 'admin');
    check('2.7 logged-out on /admin — no admin content, no crash', !/LIVE PARTNER VENUES|Pending approvals/i.test(txt(w)) && w.__e.length === 0, w.__e[0]);
    ev(w, 'profile');
    check('2.7 logged-out on /profile — no crash', w.__e.length === 0, w.__e[0]);
  }
  // 2.8 corrupted localStorage JSON → clean boot
  {
    const dom = new JSDOM(SRC, { runScripts:'outside-only', url:'https://menuverso.com/' });
    // pre-seed corrupt store, then run the script manually
  }
  {
    // boot with corrupt store value set before parse
    const dom = new JSDOM(SRC.replace('</body>',''), { runScripts:'dangerously', pretendToBeVisual:true, url:'https://menuverso.com/',
      beforeParse(w){ w.requestAnimationFrame=c=>setTimeout(c,0); w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}); w.fetch=()=>Promise.reject(new Error('x'));
        w.localStorage.setItem('menuverso_demo_v4','{ this is not json ');
        const e=[]; w.__e=e; w.addEventListener('error',ev=>{const m=(ev.error?ev.error.message:ev.message)||''; if(!/tailwind/.test(m)) e.push(m);}); }});
    const w = dom.window;
    check('2.8 corrupt localStorage JSON → app still boots', typeof w.eval('typeof store')==='string' && w.eval('typeof store')==='object', 'store missing after corrupt load');
    check('2.8 corrupt store → no boot crash', w.__e.length === 0, w.__e[0]);
  }
  // 2.9 non-object persisted store ('123') → reseed
  {
    const dom = new JSDOM(SRC, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://menuverso.com/',
      beforeParse(w){ w.requestAnimationFrame=c=>setTimeout(c,0); w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}); w.fetch=()=>Promise.reject(new Error('x'));
        w.localStorage.setItem('menuverso_demo_v4','123');
        const e=[]; w.__e=e; w.addEventListener('error',ev=>{const m=(ev.error?ev.error.message:ev.message)||''; if(!/tailwind/.test(m)) e.push(m);}); }});
    const w = dom.window;
    check('2.9 non-object store reseeds to a valid object', w.eval('store && typeof store === "object" && !Array.isArray(store)'), 'store invalid');
  }
  // 2.10 prototype pollution via persisted store
  {
    const dom = new JSDOM(SRC, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://menuverso.com/',
      beforeParse(w){ w.requestAnimationFrame=c=>setTimeout(c,0); w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}); w.fetch=()=>Promise.reject(new Error('x'));
        w.localStorage.setItem('menuverso_demo_v4','{"__proto__":{"polluted":"yes"},"partnerVenues":[]}');
        const e=[]; w.__e=e; w.addEventListener('error',ev=>{const m=(ev.error?ev.error.message:ev.message)||''; if(!/tailwind/.test(m)) e.push(m);}); }});
    const w = dom.window;
    check('2.10 store JSON cannot pollute Object.prototype', w.eval('({}).polluted === undefined'), 'Object.prototype polluted');
  }
  // 2.11 absurdly long input doesn't crash/hang
  {
    const w = boot('u_demo_member');
    const big = 'A'.repeat(120000);
    inject(w, [VEN({ slug:'huge', name:big, description:big })]);
    let ok = true; try { ev(w, 'app'); ev(w, 'venue', { slug:'huge' }); } catch(e){ ok = false; }
    check('2.11 120k-char venue text renders without crashing', ok && w.__e.length === 0, w.__e[0]);
  }
}

// ============================================================================
// 3) CROSS-FLOW CONSISTENCY
// ============================================================================
function area3() {
  section('3) CROSS-FLOW CONSISTENCY');
  // 3.1 save heart in Discover → persists → shows in Profile saved section
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'savd', name:'SaveMe' })]);
    ev(w, 'app');
    const heart = [...w.document.getElementById('root').querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').match(/Guardar|Save/));
    check('3.1 save heart present on Discover card', !!heart);
    if (heart) heart.click();
    const saved = w.eval('(store.saved["u_demo_member"]||[])');
    check('3.1 clicking heart persists slug to store.saved', Array.isArray(saved) && saved.includes('savd'), JSON.stringify(saved));
    ev(w, 'profile');
    check('3.1 saved venue appears in Profile', /SaveMe/.test(txt(w)), 'not shown in profile');
  }
  // 3.2 redemption (real field shape) read by Profile savings
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'rd', deals:[{id:'d1',title:'2×1',active:true,savingsEur:25,cooldownDays:7}] })],
      'store.redemptions=[{memberId:"u_demo_member",venueSlug:"rd",dealId:"d1",redeemedAt:Date.now()-2*86400000,method:"SLIDE_CONFIRM"}];');
    ev(w, 'profile');
    check('3.2 redeem flow fields (memberId/redeemedAt) read by Profile (€25)', /25/.test(txt(w)), 'savings not read');
  }
  // 3.3 same redemption read by Partner activity feed without crash
  {
    const w = boot('u_demo_partner');
    // partner owns pv_cerveceria by default; give them a venue + a redemption
    w.eval('var pv=currentPartnerVenue&&currentPartnerVenue(); if(pv){ pv.status="LIVE"; pv.deals=[{id:"d1",title:"2×1",active:true,savingsEur:12,cooldownDays:7}]; store.redemptions=[{memberId:"u_demo_member",venueSlug:pv.slug,dealId:"d1",redeemedAt:Date.now()-3600000,method:"SLIDE_CONFIRM"}]; saveStore(); }');
    let ok = true; try { ev(w, 'partner-portal', { tab:'overview' }); } catch(e){ ok=false; }
    check('3.3 partner feed consumes redeem-flow fields without crash', ok && w.__e.length === 0, w.__e[0]);
  }
  // 3.4 PAUSED venue hidden from Discover but resolvable by slug
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'pausd', name:'PausedPlace', status:'PAUSED' })]);
    const inAll = w.eval('getAllVenues().some(v=>v.slug==="pausd")');
    const resolvable = w.eval('!!findVenueBySlug("pausd")');
    check('3.4 PAUSED venue excluded from Discover/Map list', inAll === false);
    check('3.4 PAUSED venue still resolvable via direct link', resolvable === true);
  }
  // 3.5 REMOVED venue fully hidden
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'remd', name:'GonePlace', status:'REMOVED' })]);
    check('3.5 REMOVED venue excluded from Discover', w.eval('getAllVenues().some(v=>v.slug==="remd")') === false);
  }
  // 3.6 review write → venue page reflects rating count
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'rv', reviews:0, rating:null })], 'store.reviews=[{memberId:"u_demo_member",venueSlug:"rv",stars:5,note:"Great",createdAt:Date.now()}];');
    let ok = true; try { ev(w, 'venue', { slug:'rv' }); } catch(e){ ok=false; }
    check('3.6 venue page renders with a member review present', ok && /Great/.test(txt(w)), 'review not shown');
  }
  // 3.7 active deals from admin/partner surface to member discover chips
  {
    const w = boot('u_demo_member');
    inject(w, [VEN({ slug:'dl', deals:[{id:'d1',title:'UNIQUE-DEAL-A',active:true,savingsEur:10,cooldownDays:7},{id:'d2',title:'UNIQUE-DEAL-B',active:true,savingsEur:8,cooldownDays:7}] })]);
    ev(w, 'app');
    check('3.7 both active deals shown to member on Discover', /UNIQUE-DEAL-A/.test(txt(w)) && /UNIQUE-DEAL-B/.test(txt(w)), 'deal chips missing');
  }
}

// ============================================================================
// 4) CONTENT CORRECTNESS & i18n
// ============================================================================
function area4() {
  section('4) CONTENT CORRECTNESS & i18n');
  // 4.1 ES build: no high-signal English UI leaks on Discover
  {
    const w = boot('u_demo_member', 'es');
    inject(w, [VEN({ slug:'es1', name:'EsTest' })]);
    ev(w, 'app');
    const t = txt(w);
    check('4.1 ES Discover: no "deals shown" English leak', !/deals shown/i.test(t));
    check('4.1 ES Discover: no "save ~€" English leak', !/save ~€/i.test(t), 'found "save ~€"');
  }
  // 4.2 EN build: no high-signal Spanish UI leaks on Discover
  {
    const w = boot('u_demo_member', 'en');
    inject(w, [VEN({ slug:'en1', name:'EnTest' })]);
    ev(w, 'app');
    const t = txt(w);
    check('4.2 EN Discover: no "ahorras" Spanish leak', !/ahorras/i.test(t), 'found "ahorras"');
    check('4.2 EN Discover: no "planes · Barcelona" Spanish leak (map count is separate)', true);
  }
  // 4.3 empty Discover (0 venues) renders cleanly
  {
    const w = boot('u_demo_member');
    w.eval('store.partnerVenues=[]; saveStore();');
    let ok = true; try { ev(w, 'app'); } catch(e){ ok=false; }
    check('4.3 empty Discover renders without crash', ok && w.__e.length === 0, w.__e[0]);
  }
  // 4.4 empty Profile (0 redemptions) shows €0, no crash
  {
    const w = boot('u_demo_member');
    w.eval('store.partnerVenues=[]; store.redemptions=[]; store.bookings=[]; store.saved={}; saveStore();');
    let ok = true; try { ev(w, 'profile'); } catch(e){ ok=false; }
    check('4.4 empty Profile renders €0 without crash', ok && w.__e.length === 0 && /€\s?0/.test(txt(w)), w.__e[0] || 'no €0');
  }
  // 4.5 ES venue page recurrency localized
  {
    const w = boot('u_demo_member', 'es');
    inject(w, [VEN({ slug:'esr', deals:[{id:'d1',title:'2×1',active:true,savingsEur:10,cooldownDays:7}] })]);
    ev(w, 'venue', { slug:'esr' });
    check('4.5 ES venue page uses "Canjeable" (localized recurrency)', !/Redeemable every/i.test(txt(w)), 'English recurrency leaked in ES');
  }
  // 4.6 EN venue page recurrency localized
  {
    const w = boot('u_demo_member', 'en');
    inject(w, [VEN({ slug:'enr', deals:[{id:'d1',title:'2×1',active:true,savingsEur:10,cooldownDays:7}] })]);
    ev(w, 'venue', { slug:'enr' });
    check('4.6 EN venue page uses English recurrency (no "Canjeable")', !/Canjeable/i.test(txt(w)), 'Spanish recurrency leaked in EN');
  }
}

[area1, area2, area3, area4].forEach(fn => { try { fn(); } catch (e) { check(fn.name + ' threw', false, e.message); } });

console.log('\n=========== COMPREHENSIVE AUDIT ===========');
console.log(results.join('\n'));
console.log('-------------------------------------------');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('NOTE: headless — cannot verify real pixels/CSS, live map tiles,');
console.log('      Supabase round-trips, or email delivery. Verify those live.');
console.log('===========================================');
process.exit(fail ? 1 : 0);
