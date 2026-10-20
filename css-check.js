#!/usr/bin/env node
// ============================================================================
// Is app.css up to date with index.html? (QA item 17)
//   node css-check.js
// Rebuilds Tailwind into a temp file and compares it with the committed
// app.css, then checks index.html links the current ?v= hash. Fails with the
// fix ("npm run build:css") when a new class was added without rebuilding.
// ============================================================================
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const root = __dirname;
const tmp = path.join(os.tmpdir(), 'mv-app-css-check.css');
let bin;
try { bin = require.resolve('tailwindcss/lib/cli.js'); }
catch (e) { console.error('tailwindcss not installed: run npm install first'); process.exit(2); }
execFileSync(process.execPath, [bin, '-c', 'tailwind.config.js', '-i', 'tailwind.input.css', '-o', tmp, '--minify'], { cwd: root, stdio: 'pipe' });
const fresh = fs.readFileSync(tmp, 'utf8');
const committed = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const v = crypto.createHash('sha256').update(Buffer.from(committed)).digest('hex').slice(0, 10);
let ok = true;
if (fresh.trim() !== committed.trim()) { ok = false; console.log('  FAIL  app.css is stale: index.html uses classes it does not contain → npm run build:css'); }
else console.log('  PASS  app.css matches a fresh build');
if (!html.includes('href="/app.css?v=' + v + '"')) { ok = false; console.log('  FAIL  index.html links an old app.css hash → npm run build:css'); }
else console.log('  PASS  index.html links the current app.css (v=' + v + ')');
if (/cdn\.tailwindcss\.com/.test(html)) { ok = false; console.log('  FAIL  the Tailwind Play CDN is back in index.html'); }
else console.log('  PASS  no Tailwind Play CDN');
process.exit(ok ? 0 : 1);
