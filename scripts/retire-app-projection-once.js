const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-projection-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');
const marker = `/* ============================================================\n   PROJEÇÃO — Previsão de Patrimônio (12 meses)\n   ============================================================ */`;
const start = app.indexOf(marker);
if (start < 0) throw new Error('Legacy projection section not found');
if (app.indexOf(marker, start + marker.length) >= 0) throw new Error('Multiple legacy projection sections found');

const tail = app.slice(start);
if (!tail.includes('let _projectionChart = null;') || !tail.includes('function renderProjection(data) {')) {
  throw new Error('Expected legacy projection runtime missing from app.js tail');
}
if (!tail.trimEnd().endsWith('}')) throw new Error('Projection section is not final app.js runtime; refusing EOF cleanup');

app = `${app.slice(0, start).trimEnd()}\n`;
if (/function renderProjection\(|_projectionChart|projectionChart/.test(app)) {
  throw new Error('Legacy projection marker survived app.js cleanup');
}
if (!app.includes('function renderAll(')) throw new Error('Temporary renderAll bridge must remain');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const movementsDecl = "const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');";
if (!test.includes("const projection = fs.readFileSync(path.join(root, 'app-projection.js'), 'utf8');")) {
  if (!test.includes(movementsDecl)) throw new Error('Movement declaration marker not found');
  test = test.replace(movementsDecl, `${movementsDecl}\nconst projection = fs.readFileSync(path.join(root, 'app-projection.js'), 'utf8');`);
}

test = test.replaceAll(
  '  assert.match(app, /function renderProjection\\(/);',
  "  assert.doesNotMatch(app, /function renderProjection\\(/);\n  assert.match(projection, /function renderProjection\\(data, options = \\{\\}\\)/);\n  assert.match(planning, /root\\.PlannkeProjection\\?\\.renderProjection\\?\\.\\(/);"
);

const ownershipTest = `\ntest('app monolith no longer owns projection model chart or summary', () => {\n  assert.doesNotMatch(app, /function renderProjection\\(/);\n  assert.doesNotMatch(app, /_projectionChart|projectionChart/);\n  assert.doesNotMatch(app, /projection-summary-list|projectionChart/);\n\n  assert.match(projection, /function buildProjectionModel\\(/);\n  assert.match(projection, /function renderProjection\\(data, options = \\{\\}\\)/);\n  assert.match(projection, /function renderSummary\\(/);\n  assert.match(projection, /root\\.PlannkeProjection = api/);\n  assert.match(planning, /root\\.PlannkeProjection\\?\\.renderProjection\\?\\.\\(/);\n});\n\ntest('legacy renderAll reaches projection only after canonical projection and planning runtimes are ready', () => {\n  assert.match(app, /function renderAll\\(\\)[\\s\\S]*renderProjection\\(data\\);/);\n  assert.match(navigation, /root\\.PlannkeProjectionReady = projectionReady/);\n  assert.match(navigation, /root\\.PlannkePlanningReady = planningReady/);\n  assert.ok(navigation.indexOf(\"if (!projection) throw new Error('Runtime canônico de Projeção não inicializou.');\") < navigation.indexOf('legacyInitApp.apply(root, args)'));\n});\n`;
if (!test.includes("test('app monolith no longer owns projection model chart or summary'")) {
  test = `${test.trimEnd()}\n${ownershipTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-excel-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-projection-once.js')) {
  test = test.replace(
    artifactNeedle,
    `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-projection-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-projection-once.yml')), false);`
  );
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Retired legacy projection runtime from app.js.');
