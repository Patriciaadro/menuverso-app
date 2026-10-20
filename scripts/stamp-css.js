// Stamps index.html's app.css link with a content hash so browsers and the CDN
// pick up a rebuilt stylesheet immediately (QA item 17). Run via npm run build:css.
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app.css'));
const v = crypto.createHash('sha256').update(css).digest('hex').slice(0, 10);
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const tag = '<link rel="stylesheet" href="/app.css?v=' + v + '">';
if (/<link rel="stylesheet" href="\/app\.css\?v=[0-9a-f]+">/.test(html)) {
  html = html.replace(/<link rel="stylesheet" href="\/app\.css\?v=[0-9a-f]+">/, tag);
} else {
  // Must sit at the END of <head>: in production the Play CDN's styles came
  // after the page's own <style>, so Tailwind utilities win ties. Keep that order.
  html = html.replace('</head>', '<!-- Tailwind, compiled (npm run build:css). Keep last in <head>. -->\n' + tag + '\n</head>');
}
fs.writeFileSync(file, html);
console.log('app.css stamped v=' + v);
