// ============================================================================
// Menuverso — /api/* SERVERLESS HOSTILE + E2E AUDIT
// Requires each handler directly, mocks fetch/req/res, and attacks them:
// method enforcement, GDPR consent gate, token hashing, injection encoding,
// field truncation, failure handling, and secret-leak checks.
// Supabase/Resend are mocked — this verifies OUR code, not their services.
// Usage: node api-audit.js /path/to/Menuverso/api
// ============================================================================
const path = require('path');
const crypto = require('crypto');
const API_DIR = process.argv[2];

let pass = 0, fail = 0; const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS  ' + name); }
  else { fail++; results.push('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function section(t){ results.push('\n--- ' + t + ' ---'); }

// ---- mocks ----
let CALLS = [];
let RESP = () => ({ ok: true, status: 200, json: async () => [] });
global.fetch = async (url, opts) => { CALLS.push({ url: String(url), opts: opts || {} }); return RESP(url, opts); };
function mockRes() {
  return { _status: 200, _json: undefined, _headers: {},
    status(c){ this._status = c; return this; },
    json(o){ this._json = o; return this; },
    setHeader(k,v){ this._headers[k] = v; } };
}
function load(file, env) {
  for (const k of Object.keys(require.cache)) if (k.split(path.sep).includes('api')) delete require.cache[k];
  const base = { SUPABASE_URL: 'https://qjrqnnrucdvpwrbkxean.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc_secret_KEY', RESEND_API_KEY: 're_test' };
  const merged = Object.assign({}, base, env || {});
  for (const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY']) {
    if (merged[k] === null) delete process.env[k]; else process.env[k] = merged[k];
  }
  return require(path.join(API_DIR, file));
}
async function call(file, req, env) { CALLS = []; const h = load(file, env); const res = mockRes(); await h(req, res); return res; }
const bodyOf = (urlMatch, method) => { const c = CALLS.find(c => c.url.includes(urlMatch) && (!method || (c.opts.method||'GET')===method)); return c ? (()=>{ try { return JSON.parse(c.opts.body); } catch { return null; } })() : null; };
const noSecretLeak = (res) => !JSON.stringify(res._json || {}).includes('svc_secret_KEY');

(async function main() {

  // ===== GENERAL HARDENING =====
  section('GENERAL — method, config, malformed body');
  {
    let r = await call('waitlist.js', { method:'GET', query:{}, headers:{} });
    check('waitlist GET → 405', r._status === 405, 'got ' + r._status);
    r = await call('redeem.js', { method:'GET', query:{}, headers:{} });
    check('redeem GET → 405', r._status === 405, 'got ' + r._status);
    r = await call('member-confirm.js', { method:'GET', query:{}, headers:{} });
    check('member-confirm GET → 405', r._status === 405, 'got ' + r._status);
    r = await call('waitlist.js', { method:'POST', body:{ email:'a@b.com', consent:true }, headers:{} }, { SUPABASE_URL:null });
    check('missing env → 500 server_not_configured', r._status === 500 && r._json && r._json.error === 'server_not_configured', JSON.stringify(r._json));
    r = await call('redeem.js', { method:'POST', body:'{ not json', headers:{} });
    check('redeem malformed JSON body → handled, no throw (4xx/5xx)', r._status >= 400, 'got ' + r._status);
  }

  // ===== waitlist.js =====
  section('waitlist.js — GDPR consent + validation');
  {
    let r = await call('waitlist.js', { method:'POST', body:{ email:'nope', consent:true }, headers:{} });
    check('W invalid email → 400 invalid_email', r._status === 400 && r._json.error === 'invalid_email', JSON.stringify(r._json));
    r = await call('waitlist.js', { method:'POST', body:{ email:'a@b.com', consent:false }, headers:{} });
    check('W no consent → 400 consent_required (GDPR gate)', r._status === 400 && r._json.error === 'consent_required', JSON.stringify(r._json));
    r = await call('waitlist.js', { method:'POST', body:{ email:'a@b.com', consent:'yes' }, headers:{} });
    check('W truthy-but-not-true consent ("yes") → still rejected', r._status === 400 && r._json.error === 'consent_required', JSON.stringify(r._json));
    r = await call('waitlist.js', { method:'POST', body:{ email:'a@b.com\nbcc:evil@x.com', consent:true }, headers:{} });
    check('W header-injection email (newline) → 400 (regex blocks)', r._status === 400, JSON.stringify(r._json));
    // valid path
    r = await call('waitlist.js', { method:'POST', body:{ email:'Real@Email.com', consent:true }, headers:{ 'x-forwarded-for':'1.2.3.4' } });
    check('W valid signup → 200 ok', r._status === 200 && r._json.ok === true, JSON.stringify(r._json));
    const upsert = bodyOf('launch_waitlist', 'POST');
    check('W upsert stores double_opt_in_confirmed=false', upsert && upsert.double_opt_in_confirmed === false, JSON.stringify(upsert));
    check('W email normalized to lowercase', upsert && upsert.email === 'real@email.com', upsert && upsert.email);
    check('W consent version + IP captured (audit trail)', upsert && upsert.consent_version && upsert.ip_address === '1.2.3.4', JSON.stringify(upsert));
    check('W confirmation token stored as HASH (raw token not persisted)', !!bodyOf('waitlist_confirmations','POST') && !!bodyOf('waitlist_confirmations','POST').token_hash);
    check('W response never leaks service key', noSecretLeak(r));
    // email send failure must not lose the signup
    RESP = (url) => String(url).includes('resend.com') ? Promise.reject(new Error('smtp down')) : { ok:true, status:200, json: async()=>[] };
    r = await call('waitlist.js', { method:'POST', body:{ email:'x@y.com', consent:true }, headers:{} });
    check('W signup persists even if email send throws (ok:true, emailed:false)', r._status === 200 && r._json.ok === true && r._json.emailed === false, JSON.stringify(r._json));
    RESP = () => ({ ok:true, status:200, json: async()=>[] });
  }

  // ===== confirm.js =====
  section('confirm.js — token verification');
  {
    const TOK = 'rawtoken_ABC+/=&x';
    const HASH = crypto.createHash('sha256').update(TOK).digest('hex');
    let r = await call('confirm.js', { method:'GET', query:{}, headers:{} });
    check('C missing token → 400', r._status === 400, JSON.stringify(r._json));
    // unknown token: both tables empty
    RESP = () => ({ ok:true, status:200, json: async()=>[] });
    r = await call('confirm.js', { method:'GET', query:{ token:'whatever' }, headers:{} });
    check('C unknown token → 404 invalid', r._status === 404, JSON.stringify(r._json));
    // looked up by HASH, raw token never in query string
    const lookup = CALLS.find(c => c.url.includes('waitlist_confirmations'));
    check('C lookup uses sha256 hash, not raw token', lookup && !lookup.url.includes('whatever'), lookup && lookup.url);
    // used waitlist token → idempotent success
    RESP = (url) => String(url).includes('waitlist_confirmations') && String(url).includes('select')
      ? { ok:true, status:200, json: async()=>[{ email:'a@b.com', expires_at:new Date(Date.now()+9e9).toISOString(), used_at:new Date().toISOString() }] }
      : { ok:true, status:200, json: async()=>[] };
    r = await call('confirm.js', { method:'GET', query:{ token:TOK }, headers:{} });
    check('C already-used token → 200 already:true (idempotent)', r._status === 200 && r._json.already === true, JSON.stringify(r._json));
    const usedLookup = CALLS.find(c => c.url.includes('waitlist_confirmations'));
    check('C special-char token URL-encoded (no query breakout)', usedLookup && usedLookup.url.includes(encodeURIComponent(HASH)) && !usedLookup.url.includes('&x'), usedLookup && usedLookup.url);
    // expired
    RESP = (url) => String(url).includes('waitlist_confirmations') && String(url).includes('select')
      ? { ok:true, status:200, json: async()=>[{ email:'a@b.com', expires_at:new Date(Date.now()-9e9).toISOString(), used_at:null }] }
      : { ok:true, status:200, json: async()=>[] };
    r = await call('confirm.js', { method:'GET', query:{ token:TOK }, headers:{} });
    check('C expired token → 410', r._status === 410, JSON.stringify(r._json));
    // valid waitlist token → 200 + PATCH launch_waitlist
    RESP = (url) => String(url).includes('waitlist_confirmations') && String(url).includes('select')
      ? { ok:true, status:200, json: async()=>[{ email:'a@b.com', expires_at:new Date(Date.now()+9e9).toISOString(), used_at:null }] }
      : { ok:true, status:200, json: async()=>[] };
    r = await call('confirm.js', { method:'GET', query:{ token:TOK }, headers:{} });
    check('C valid waitlist token → 200 ok', r._status === 200 && r._json.ok === true, JSON.stringify(r._json));
    check('C valid token PATCHes launch_waitlist confirmed=true', !!CALLS.find(c => c.url.includes('launch_waitlist') && (c.opts.method==='PATCH')));
    // member token (waitlist empty, member table has it)
    RESP = (url) => String(url).includes('member_confirmations') && String(url).includes('select')
      ? { ok:true, status:200, json: async()=>[{ email:'m@b.com', expires_at:new Date(Date.now()+9e9).toISOString(), used_at:null }] }
      : { ok:true, status:200, json: async()=>[] };
    r = await call('confirm.js', { method:'GET', query:{ token:TOK }, headers:{} });
    check('C member token (fallback table) → 200 kind:member', r._status === 200 && r._json.kind === 'member', JSON.stringify(r._json));
  }

  // ===== redeem.js =====
  section('redeem.js — write redemption');
  {
    let r = await call('redeem.js', { method:'POST', body:{}, headers:{} });
    check('R missing venueSlug → 400', r._status === 400, JSON.stringify(r._json));
    RESP = () => ({ ok:true, status:200, json: async()=>[{ id: 'red_1' }] });
    r = await call('redeem.js', { method:'POST', body:{ venueSlug:'Sky-Lounge', memberName:'z'.repeat(200), dealTitle:'t'.repeat(300) }, headers:{} });
    check('R valid → 200 ok', r._status === 200 && r._json.ok === true, JSON.stringify(r._json));
    const ins = bodyOf('/redemptions', 'POST');
    check('R venue slug lowercased in row', ins && ins.venue_slug === 'sky-lounge', ins && ins.venue_slug);
    check('R memberName truncated to ≤120', ins && ins.member_name.length === 120, ins && ins.member_name.length);
    check('R dealTitle truncated to ≤160', ins && ins.deal_title.length === 160, ins && ins.deal_title.length);
    check('R response never leaks service key', noSecretLeak(r));
    // hostile: invalid redeemedAt must not 500
    RESP = () => ({ ok:true, status:200, json: async()=>[{ id:'red_2' }] });
    r = await call('redeem.js', { method:'POST', body:{ venueSlug:'x', redeemedAt:'not-a-date' }, headers:{} });
    check('R invalid redeemedAt → still 200 (defaults, no 500)', r._status === 200, 'got ' + r._status + ' ' + JSON.stringify(r._json));
    // insert failure → 502
    RESP = () => ({ ok:false, status:500, json: async()=>({}) });
    r = await call('redeem.js', { method:'POST', body:{ venueSlug:'x' }, headers:{} });
    check('R DB insert failure → 502', r._status === 502, JSON.stringify(r._json));
    // broadcast failure must not fail the request
    let n = 0;
    RESP = (url) => { if (String(url).includes('/broadcast')) return Promise.reject(new Error('rt down')); return { ok:true, status:200, json: async()=>[{ id:'red_3' }] }; };
    r = await call('redeem.js', { method:'POST', body:{ venueSlug:'x' }, headers:{} });
    check('R realtime broadcast failure → request still 200', r._status === 200, JSON.stringify(r._json));
    RESP = () => ({ ok:true, status:200, json: async()=>[] });
  }

  // ===== redemptions.js =====
  section('redemptions.js — read feed');
  {
    let r = await call('redemptions.js', { method:'GET', query:{}, headers:{} });
    check('RD missing venue → 400', r._status === 400, JSON.stringify(r._json));
    RESP = () => ({ ok:true, status:200, json: async()=>[{ id:'1', venue_slug:'x' }] });
    r = await call('redemptions.js', { method:'GET', query:{ venue:'Cerveceria & Co', since:'garbage' }, headers:{} });
    check('RD valid → 200 array', r._status === 200 && Array.isArray(r._json), JSON.stringify(r._json).slice(0,60));
    const q = CALLS.find(c => c.url.includes('/redemptions'));
    check('RD venue URL-encoded (injection-safe)', q && q.url.includes(encodeURIComponent('cerveceria & co')), q && q.url);
    check('RD invalid "since" → defaults (still queries, no crash)', !!q && q.url.includes('redeemed_at=gte.'));
    check('RD sets no-store cache header', r._headers['Cache-Control'] === 'no-store');
    RESP = () => ({ ok:false, status:500, json: async()=>({}) });
    r = await call('redemptions.js', { method:'GET', query:{ venue:'x' }, headers:{} });
    check('RD upstream query failure → 502', r._status === 502, JSON.stringify(r._json));
    RESP = () => ({ ok:true, status:200, json: async()=>[] });
  }

  // ===== member-confirm.js =====
  section('member-confirm.js — signup token email');
  {
    let r = await call('member-confirm.js', { method:'POST', body:{ email:'bad' }, headers:{} });
    check('M invalid email → 400', r._status === 400, JSON.stringify(r._json));
    r = await call('member-confirm.js', { method:'POST', body:{ email:'New@Member.com', name:'N'.repeat(200) }, headers:{} });
    check('M valid → 200 ok', r._status === 200 && r._json.ok === true, JSON.stringify(r._json));
    const ins = bodyOf('member_confirmations', 'POST');
    check('M stores token hash + lowercased email', ins && ins.token_hash && ins.email === 'new@member.com', JSON.stringify(ins));
    check('M name truncated to ≤80', ins && ins.name.length === 80, ins && ins.name && ins.name.length);
    check('M response never leaks service key', noSecretLeak(r));
  }

  console.log('\n========== /api/* HOSTILE + E2E AUDIT ==========');
  console.log(results.join('\n'));
  console.log('------------------------------------------------');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  console.log('NOTE: Supabase/Resend mocked — verifies OUR endpoint logic,');
  console.log('      not the live services, RLS, or real email deliverability.');
  console.log('================================================');
  process.exit(fail ? 1 : 0);
})();
