const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app-presentation-desktop.js'), 'utf8');

test('canonical data runtime owns the bank import entry panel', () => {
  assert.match(appData, /function ensureBankImportPanel\(/);
  assert.match(appData, /function refreshBankAccountOptions\(/);
  assert.match(appData, /panel\.id = 'product-bank-import'/);
  assert.match(appData, /input\.id = 'product-bank-file'/);
  assert.match(appData, /account\.id = 'product-bank-account'/);
  assert.match(appData, /ensureBankImportPanel,/);
});

test('bank import entry is DOM-safe and does not read files directly', () => {
  assert.match(appData, /document\.createElement\('select'\)/);
  assert.match(appData, /select\.replaceChildren\(...options\)/);
  assert.doesNotMatch(appData, /\.innerHTML\s*=/);
  assert.doesNotMatch(appData, /FileReader/);
});

test('canonical data runtime remains the bank import owner', () => {
  assert.match(appData, /function captureBankImport\(/);
  assert.match(appData, /function stageBankFile\(/);
});

test('data runtime owns bank import staging while presentation only renders the review', () => {
  assert.match(appData, /function captureBankImport\(/);
  assert.match(appData, /function stageBankFile\(/);
  assert.match(appData, /event\.stopImmediatePropagation\(\)/);
  assert.match(desktop, /function renderBankImportReview\(/);
  assert.doesNotMatch(desktop, /function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\(/);
});

test('bank account choices refresh after canonical data changes', () => {
  assert.match(appData, /root\.addEventListener\?\.\('plannke:data-changed'/);
  assert.match(appData, /root\.setTimeout\(ensureBankImportPanel, 0\)/);
});

test('one-time bank import entry migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-bank-import-entry-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-bank-import-entry-once.yml')), false);
});
