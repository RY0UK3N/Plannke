const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const packagePath = path.join(root, 'package.json');
const workflowPath = path.join(root, '.github', 'workflows', 'remove-app-js-once.yml');
const selfPath = __filename;

if (!fs.existsSync(appPath)) throw new Error('app.js is already absent; refusing ambiguous removal.');
fs.unlinkSync(appPath);

let pkg = fs.readFileSync(packagePath, 'utf8');
const marker = ' && node --check app.js';
if (!pkg.includes(marker)) throw new Error('package.json no longer syntax-checks app.js at expected marker.');
pkg = pkg.replace(marker, '');
if (pkg.includes('node --check app.js')) throw new Error('app.js syntax check survived package cleanup.');
fs.writeFileSync(packagePath, pkg);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Removed app.js and its syntax-check entry.');
