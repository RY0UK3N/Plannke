const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-excel-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');
const marker = `/* ============================================================\n   EXCEL — Memory Card (Enhanced Export)\n   ============================================================ */`;
const start = app.indexOf(marker);
if (start < 0) throw new Error('Legacy Excel/Memory Card section not found');
if (app.indexOf(marker, start + marker.length) >= 0) throw new Error('Multiple legacy Excel/Memory Card sections found');

const tail = app.slice(start);
[
  'function exportToExcel()',
  'function importFromExcel(event)',
  'new FileReader()',
  'Planner_MemoryCard_',
  '_backupDone = true'
].forEach(expected => {
  if (!tail.includes(expected)) throw new Error(`Expected legacy Excel marker missing from tail: ${expected}`);
});

const importEnd = '    reader.readAsArrayBuffer(file);\n}';
if (!tail.trimEnd().endsWith(importEnd)) {
  throw new Error('Legacy Excel block is not the final app.js section; refusing EOF cleanup');
}

app = `${app.slice(0, start).trimEnd()}\n`;
[
  'function exportToExcel(',
  'function importFromExcel(',
  'FileReader',
  'Planner_MemoryCard_',
  '_backupDone',
  'EXCEL — Memory Card'
].forEach(retired => {
  if (app.includes(retired)) throw new Error(`Legacy Excel marker survived cleanup: ${retired}`);
});

if (!app.includes('function renderProjection(')) throw new Error('Projection base must remain');
if (!app.includes('function renderSunburst(')) throw new Error('Movement runtime must remain');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const excelTest = `\ntest('app monolith no longer owns Excel or Memory Card runtime', () => {\n  assert.doesNotMatch(app, /EXCEL — Memory Card/);\n  assert.doesNotMatch(app, /function exportToExcel\\(/);\n  assert.doesNotMatch(app, /function importFromExcel\\(/);\n  assert.doesNotMatch(app, /\\bFileReader\\b/);\n  assert.doesNotMatch(app, /_backupDone/);\n  assert.doesNotMatch(app, /Planner_MemoryCard_/);\n\n  assert.match(appData, /root\\.exportToExcel = exportToExcel/);\n  assert.match(appData, /Plannke_Relatorio_/);\n  assert.doesNotMatch(appData, /importFromExcel|FileReader|Memory Card|_backupDone/);\n  assert.match(navigation, /\\['confirmClearData', 'exportToExcel'\\]/);\n});\n`;
if (!test.includes("test('app monolith no longer owns Excel or Memory Card runtime'")) {
  test = `${test.trimEnd()}\n${excelTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-renderers-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-excel-once.js')) {
  test = test.replace(
    artifactNeedle,
    `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-excel-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-excel-once.yml')), false);`
  );
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy Excel/Memory Card runtime from app.js.');
