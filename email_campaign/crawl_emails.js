#!/usr/bin/env node
/* ============================================================================
 * Menuverso — restaurant email crawler (Phase 2)
 * Reads a targets CSV (name,website,...) and visits each venue's website +
 * its likely contact / legal pages, extracts emails, validates MX, and writes
 * a results CSV. Built for the Eixample pilot but works for any targets file.
 *
 * Run it LOCALLY (not in the Cowork sandbox):
 *     node crawl_emails.js eixample_targets.csv eixample_emails.csv
 *
 * No npm install needed — uses Node 18+ built-ins (global fetch + dns).
 * Politeness: low concurrency, randomized delays, real User-Agent, per-request
 * timeout. Be a good citizen; this is your domain reputation on the line.
 * ========================================================================== */
const fs = require('fs');
const dns = require('dns').promises;

const IN = process.argv[2] || 'eixample_targets.csv';
const OUT = process.argv[3] || 'eixample_emails.csv';
const CONCURRENCY = 4;            // simultaneous venues
const REQ_TIMEOUT_MS = 12000;
const MIN_DELAY = 400, MAX_DELAY = 1200; // jitter between requests per worker
const UA = 'MenuversoBot/1.0 (+https://menuverso.com; partner outreach research)';

// Pages most likely to carry a real contact email (Spain: /aviso-legal is gold).
const PATHS = ['', '/contacto', '/contacto/', '/contact', '/contact/', '/aviso-legal',
  '/aviso-legal/', '/avisolegal', '/legal', '/nosotros', '/about', '/about-us'];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Junk we never want as a "contact" address.
const JUNK = /(noreply|no-reply|sentry|wixpress|wixstatic|parastorage|gstatic|googleapis|bootstrapcdn|cloudflare|jsdelivr|cdn\.|gravatar|schema|w3\.org|googletagmanager|\.png|\.jpe?g|\.gif|\.webp|\.svg|\.woff|\.ttf|\.eot|\.css|\.js|\.min|\.bundle|\.map|example\.|placeholder|yourdomain|domain\.com|@2x|@3x)/i;
const ROLE = /^(info|hola|contacto|contact|reservas|reservations|booking|eventos|hello|administracion|gerencia)@/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));

function parseCSV(txt) {
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map(line => {
    // simple CSV (our export has no embedded commas in key fields; quoted-safe enough)
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    const o = {}; head.forEach((h, i) => o[h.trim()] = (cells[i] || '').trim());
    return o;
  });
}

function csvCell(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!r.ok) return '';
    const ct = r.headers.get('content-type') || '';
    if (!/text|html/.test(ct)) return '';
    return await r.text();
  } catch { return ''; }
  finally { clearTimeout(t); }
}

// TLDs that are really code tokens (data.length -> d@a.length etc.). Belt-and-
// braces alongside the bracketed-only de-obfuscation fix.
const BAD_TLD = /\.(length|href|has|is|js|css|min|html?|php|png|jpe?g|gif|svg|webp|woff|ttf|map|json|xml|bundle|reload|origin|hostname|search|split|random|trunc|floor|max|abs|cos|sin|now|round|pow|sqrt|hypot|acos|tan|pi|ceil)$/i;
// Local part must start alphanumeric (rejects .wp-block-...@..., etc.).
const STRICT_EMAIL = /^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9.\-]+\.[a-z]{2,24}$/;
function extractEmails(html) {
  const found = new Set();
  // mailto: links (most reliable)
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) try { found.add(decodeURIComponent(m[1])); } catch(e) { found.add(m[1]); }
  // raw text matches
  for (const m of html.matchAll(EMAIL_RE)) found.add(m[0]);
  // De-obfuscate ONLY clearly-bracketed patterns: "info [at] x [dot] com" / "(at)".
  // (The old version matched bare "at"/"dot", which mangled words like
  //  data->d@a, navigation->navig@ion, static->st@ic. Bracketed-only fixes that.)
  const deob = html
    .replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, '.');
  for (const m of deob.matchAll(EMAIL_RE)) found.add(m[0]);
  return [...found]
    .map(e => e.trim().toLowerCase().replace(/^mailto:/, '').replace(/[.,;:]+$/, ''))
    .filter(e => STRICT_EMAIL.test(e) && !JUNK.test(e) && !BAD_TLD.test(e) && !e.includes('..') && e.length < 80);
}

function pickBest(emails, siteHost) {
  if (!emails.length) return null;
  // prefer role addresses, then ones on the venue's own domain, then anything.
  const role = emails.filter(e => ROLE.test(e));
  const onDomain = emails.filter(e => siteHost && e.endsWith('@' + siteHost.replace(/^www\./, '')));
  return (role.find(e => onDomain.includes(e))) || role[0] || onDomain[0] || emails[0];
}

const mxCache = new Map();
async function mxOk(email) {
  const dom = email.split('@')[1];
  if (!dom) return false;
  if (mxCache.has(dom)) return mxCache.get(dom);
  let ok = false;
  try { const recs = await dns.resolveMx(dom); ok = Array.isArray(recs) && recs.length > 0; } catch { ok = false; }
  mxCache.set(dom, ok); return ok;
}

function normalizeSite(u) {
  u = (u || '').trim(); if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).origin; } catch { return ''; }
}

async function crawlVenue(row) {
  const site = normalizeSite(row.website);
  if (!site) return { ...row, email: '', email_type: '', source_url: '', mx_ok: '', status: 'no_website' };
  let host = ''; try { host = new URL(site).host; } catch {}
  const all = new Map(); // email -> source_url
  for (const p of PATHS) {
    const url = site + p;
    const html = await fetchText(url);
    if (html) for (const e of extractEmails(html)) if (!all.has(e)) all.set(e, url);
    await sleep(jitter());
    // stop early once we have a solid role address
    if ([...all.keys()].some(e => ROLE.test(e))) break;
  }
  const emails = [...all.keys()];
  const best = pickBest(emails, host);
  if (!best) return { ...row, email: '', email_type: '', source_url: '', mx_ok: '', status: 'no_email_found' };
  const ok = await mxOk(best);
  return {
    ...row, email: best,
    email_type: ROLE.test(best) ? 'role' : 'other',
    source_url: all.get(best),
    mx_ok: ok ? 'yes' : 'no',
    status: ok ? 'valid' : 'risky',
    extra_emails: emails.filter(e => e !== best).join(' | ')
  };
}

(async function main() {
  const rows = parseCSV(fs.readFileSync(IN, 'utf8'));
  console.log(`Loaded ${rows.length} targets from ${IN}`);
  // resume support: skip venues already in OUT
  const done = new Set();
  if (fs.existsSync(OUT)) parseCSV(fs.readFileSync(OUT, 'utf8')).forEach(r => done.add(r.name));
  const todo = rows.filter(r => !done.has(r.name));
  console.log(`${done.size} already done · ${todo.length} to crawl`);

  const cols = ['source_id', 'name', 'cuisine_type', 'website', 'phone', 'email', 'email_type', 'source_url', 'mx_ok', 'status', 'extra_emails', 'address_full', 'postal_code'];
  if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, cols.join(',') + '\n');

  let i = 0, found = 0;
  async function worker() {
    while (i < todo.length) {
      const row = todo[i++];
      const res = await crawlVenue(row);
      if (res.email) found++;
      fs.appendFileSync(OUT, cols.map(c => csvCell(res[c])).join(',') + '\n');
      console.log(`[${i}/${todo.length}] ${row.name} → ${res.email || res.status}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. Emails found this run: ${found}. Output: ${OUT}`);
})();
