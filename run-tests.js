#!/usr/bin/env node
// ============================================================================
// Menuverso — one-command test runner.
// Runs all three audit suites in sequence and prints a combined verdict.
//   npm test            (after: npm install)
// Individual suites:
//   npm run test:diagnostic   npm run test:audit   npm run test:api
// ============================================================================
const { spawnSync } = require('child_process');
const path = require('path');
const root = __dirname;

const suites = [
  { file: 'diagnostic.js', args: ['index.html'], label: 'E2E smoke test' },
  { file: 'audit.js',      args: ['index.html'], label: 'Comprehensive + hostile audit' },
  { file: 'api-audit.js',  args: ['api'],        label: '/api hostile + E2E audit' },
];

let suitesPassed = 0, suitesFailed = 0;
const summary = [];

for (const s of suites) {
  process.stdout.write('\n███  ' + s.label + '  (' + s.file + ')  ███\n');
  const r = spawnSync('node', [path.join(root, s.file), ...s.args.map(a => path.join(root, a))], {
    stdio: 'inherit',
    env: process.env, // honors NODE_PATH if the user sets one
  });
  if (r.status === 0) { suitesPassed++; summary.push('  ✓ ' + s.label); }
  else { suitesFailed++; summary.push('  ✗ ' + s.label + '  (exit ' + r.status + ')'); }
}

console.log('\n================ TEST SUMMARY ================');
console.log(summary.join('\n'));
console.log('---------------------------------------------');
console.log('SUITES PASSED: ' + suitesPassed + ' / ' + suites.length);
console.log('=============================================');
process.exit(suitesFailed ? 1 : 0);
