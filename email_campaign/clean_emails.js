#!/usr/bin/env node
/* ============================================================================
 * Menuverso — email list cleaner / safety net
 * Post-processes a crawl results CSV (from crawl_emails.js) and produces a
 * clean, de-duplicated, ready-to-send list. It:
 *   - re-validates every email with strict rules (rejects code/CDN junk),
 *   - if a row's primary email is junk, promotes a valid one from extra_emails,
 *   - de-duplicates across venues (keeps the first; flags the rest),
 *   - splits output into  <out>  (valid, send-ready)  and  <out>.review.csv.
 *
 * Run LOCALLY:
 *     node clean_emails.js eixample_emails.csv eixample_emails_clean.csv
 * Works regardless of how a crawl run went.
 * ========================================================================== */
const fs = require('fs');
const IN = process.argv[2] || 'eixample_emails.csv';
const OUT = process.argv[3] || (IN.replace(/\.csv$/i, '') + '_clean.csv');
const REVIEW = OUT.replace(/\.csv$/i, '') + '.review.csv';

const JUNK = /(noreply|no-reply|sentry|wixpress|wixstatic|parastorage|gstatic|googleapis|bootstrapcdn|cloudflare|jsdelivr|cdn\.|gravatar|schema|w3\.org|googletagmanager|\.png|\.jpe?g|\.gif|\.webp|\.svg|\.woff|\.ttf|\.eot|\.css|\.js|\.min|\.bundle|\.map|example\.|placeholder|yourdomain|domain\.com|@2x|@3x|transformabcn|\.parastorage)/i;
const BAD_TLD = /\.(length|href|has|is|js|css|min|html?|php|png|jpe?g|gif|svg|webp|woff|ttf|map|json|xml|bundle|reload|origin|hostname|search|split|random|trunc|floor|max|abs|cos|sin|now|round|pow|sqrt|hypot|acos|tan|pi|ceil)$/i;
const STRICT = /^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9.\-]+\.[a-z]{2,24}$/;
const ROLE = /^(info|hola|contacto|contact|reservas|reservations|booking|eventos|hello|administracion|gerencia|comunicacion|comunicaciones|marketing)@/i;
const valid = e => !!e && STRICT.test(e) && !JUNK.test(e) && !BAD_TLD.test(e) && !e.includes('..') && e.length < 80;

function parseCSV(txt) {
  const lines = txt.split(/\r?\n/).filter(l => l.length);
  const head = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitLine(line); const o = {};
    head.forEach((h, i) => o[h.trim()] = (cells[i] || '').trim());
    return o;
  });
}
function splitLine(line) {
  const cells = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur); return cells;
}
const cell = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

function bestFrom(candidates, host) {
  const v = candidates.map(e => (e || '').trim().toLowerCase()).filter(valid);
  if (!v.length) return null;
  const onDom = host ? v.filter(e => e.endsWith('@' + host.replace(/^www\./, ''))) : [];
  const role = v.filter(e => ROLE.test(e));
  return role.find(e => onDom.includes(e)) || role[0] || onDom[0] || v[0];
}

const rows = parseCSV(fs.readFileSync(IN, 'utf8'));
const seen = new Map();          // email -> first venue name
const out = [], review = [];
let promoted = 0, dropped = 0, dupes = 0;

for (const r of rows) {
  const name = r.name || '';
  let host = ''; try { host = r.website ? new URL(/^https?:/.test(r.website) ? r.website : 'https://' + r.website).host : ''; } catch {}
  const extras = (r.extra_emails || '').split(/[|;,]/).map(s => s.trim()).filter(Boolean);
  let email = (r.email || '').trim().toLowerCase();

  if (!valid(email)) {
    const promotedEmail = bestFrom([...extras], host);   // try to rescue from extras
    if (promotedEmail) { email = promotedEmail; promoted++; }
    else { dropped++; review.push({ name, website: r.website || '', reason: r.email ? 'junk_email_no_valid_alt' : (r.status || 'no_email'), raw: r.email || '' }); continue; }
  }
  if (seen.has(email)) { dupes++; review.push({ name, website: r.website || '', reason: 'duplicate_of_' + seen.get(email), raw: email }); continue; }
  seen.set(email, name);
  out.push({
    name, email,
    email_type: ROLE.test(email) ? 'role' : 'other',
    website: r.website || '', phone: r.phone || '',
    source_url: r.source_url || '', mx_ok: r.mx_ok || '',
    address_full: r.address_full || '', postal_code: r.postal_code || ''
  });
}

const ocols = ['name', 'email', 'email_type', 'website', 'phone', 'source_url', 'mx_ok', 'address_full', 'postal_code'];
fs.writeFileSync(OUT, ocols.join(',') + '\n' + out.map(r => ocols.map(c => cell(r[c])).join(',')).join('\n') + '\n');
const rcols = ['name', 'website', 'reason', 'raw'];
fs.writeFileSync(REVIEW, rcols.join(',') + '\n' + review.map(r => rcols.map(c => cell(r[c])).join(',')).join('\n') + '\n');

console.log(`Input rows:        ${rows.length}`);
console.log(`Clean send-ready:  ${out.length}   → ${OUT}`);
console.log(`  rescued from extra_emails: ${promoted}`);
console.log(`Needs review/skip:  ${review.length}   → ${REVIEW}   (junk: ${dropped}, dupes: ${dupes})`);
console.log(`Role addresses:     ${out.filter(r => r.email_type === 'role').length} / ${out.length} (lower legal risk + better deliverability)`);
