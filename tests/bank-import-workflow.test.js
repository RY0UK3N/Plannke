const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appData = fs.readFileSync(path.join(root, 'src', 'app', 'app-data.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'src', 'app', 'app-presentation-desktop.js'), 'utf8');
const storageUi = fs.readFileSync(path.join(root, 'src', 'app', 'storage-ui.js'), 'utf8');

test('data runtime owns the complete bank import controller and pending state', () => {
  assert.match(appData, /let pendingBankImport = null/);
  ['getPendingBankImport', 'updateBankImportItem', 'cancelBankImport', 'confirmBankImport', 'readBankFileText', 'stageBankFile', 'captureBankImport']
    .forEach(name => assert.match(appData, new RegExp('function\\s+' + name + '\\s*\\(')));
  assert.match(appData, /parseOfxBank/);
  assert.match(appData, /parseCsvBank/);
  assert.match(appData, /dedupeImported/);
});

test('bank files use ArrayBuffer plus explicit local decoders instead of FileReader', () => {
  assert.match(appData, /file\.arrayBuffer\(\)/);
  assert.match(appData, /'windows-1252'/);
  assert.match(appData, /'utf-8'/);
  assert.match(appData, /new Decoder\(encoding\)\.decode/);
  assert.doesNotMatch(appData, /FileReader/);
});

test('small reviewed imports create a specific recovery point before mutation', () => {
  assert.match(appData, /selected\.length < 5/);
  assert.match(appData, /createSnapshot\?\.\('before-bank-import'\)/);
  assert.ok(appData.indexOf("createSnapshot?.('before-bank-import')") < appData.indexOf('selected.forEach(item =>'));
  assert.doesNotMatch(storageUi, /protectSmallBankImport|selectedCount/);
});

test('presentation renders review state but cannot own or mutate the controller directly', () => {
  assert.match(desktop, /const pendingBankImport = bankImport\?\.getPendingBankImport\?\.\(\)/);
  assert.match(desktop, /bankImport\?\.updateBankImportItem\?\./);
  assert.match(desktop, /bankImport\?\.cancelBankImport\?\./);
  assert.match(desktop, /bankImport\?\.confirmBankImport\?\./);
  assert.doesNotMatch(desktop, /let pendingBankImport/);
  assert.doesNotMatch(desktop, /function (?:merchantRuleKey|captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\(/);
  assert.doesNotMatch(desktop, /FileReader|parseOfxBank|parseCsvBank|dedupeImported/);
  assert.doesNotMatch(desktop, /root\.saveData|PlannkeStorage|data\.transactions\.push/);
});

test('bank import financial mutation stays behind the canonical data boundary', () => {
  assert.match(appData, /root\.saveData\?\.\(data\)/);
  assert.match(appData, /data\.transactions\.push\(transaction\)/);
  assert.match(appData, /PlannkeStorage\?\.createSnapshot/);
  assert.doesNotMatch(storageUi, /presentation-import-review|Confirmar selecionadas/);
});

test('data capture listener remains in the capture phase and review focus stays visual', () => {
  assert.match(appData, /document\.addEventListener\('change', captureBankImport, true\)/);
  assert.match(appData, /event\.stopImmediatePropagation\(\)/);
  assert.match(desktop, /if \(options\.focus\) review\.scrollIntoView/);
});

test('one-time bank workflow migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-bank-import-workflow-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-bank-import-workflow-once.yml')), false);
});
