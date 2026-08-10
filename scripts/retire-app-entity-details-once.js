const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const retirementTestPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-entity-details-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');
const sectionLabel = 'VALORES DE DETALHE (Extratos / Faturas)';
const startMarker = `/* ============================================================\n   ${sectionLabel}\n   ============================================================ */\nwindow._detailContext = {`;
const endMarker = 'function filterDashboardToTransactions(type) {';
const start = app.indexOf(startMarker);
const end = app.indexOf(endMarker, start + startMarker.length);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Could not locate legacy entity detail block in app.js');
}
if (app.indexOf(startMarker, start + startMarker.length) >= 0) {
  throw new Error('Multiple legacy entity detail blocks found');
}

app = app.slice(0, start) + app.slice(end);
[
  sectionLabel,
  'function viewAccountStatement(',
  'function viewCardInvoice('
].forEach(marker => {
  if (app.includes(marker)) throw new Error(`Legacy entity marker survived app.js cleanup: ${marker}`);
});
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(retirementTestPath, 'utf8');
const declarationMarker = "const productUiLogic = fs.readFileSync(path.join(root, 'tests', 'product-ui-logic.test.js'), 'utf8');";
if (!test.includes("const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');")) {
  if (!test.includes(declarationMarker)) throw new Error('Retirement test declaration marker not found');
  test = test.replace(
    declarationMarker,
    `${declarationMarker}\nconst app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');\nconst entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');`
  );
}

const entityTest = `\ntest('app monolith no longer owns account statement or card invoice details', () => {\n  assert.doesNotMatch(app, /VALORES DE DETALHE \\(Extratos \\/ Faturas\\)/);\n  assert.doesNotMatch(app, /function viewAccountStatement\\(/);\n  assert.doesNotMatch(app, /function viewCardInvoice\\(/);\n  assert.match(entities, /function viewAccountStatement\\(/);\n  assert.match(entities, /function viewCardInvoice\\(/);\n  assert.match(entities, /root\\._detailContext = \\{/);\n});\n`;
if (!test.includes("test('app monolith no longer owns account statement or card invoice details'")) {
  test = `${test.trimEnd()}\n${entityTest}`;
}

const oldArtifactTest = `  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-planning-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-planning-once.yml')), false);`;
const newArtifactTest = `${oldArtifactTest}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-entity-details-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-entity-details-once.yml')), false);`;
if (test.includes(oldArtifactTest) && !test.includes('retire-app-entity-details-once.js')) {
  test = test.replace(oldArtifactTest, newArtifactTest);
}
fs.writeFileSync(retirementTestPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy account/card detail runtime from app.js.');
