const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const dataActions = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('navigation and keyboard shortcuts live outside application orchestration', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(runtime, /function setupNavigation\s*\(/);
  assert.doesNotMatch(runtime, /function setupKeyboardShortcuts\s*\(/);
  assert.doesNotMatch(runtime, /function _navigateTo\s*\(/);
  assert.doesNotMatch(runtime, /function mobileNav\s*\(/);
  assert.match(runtime, /root\.setupNavigation\?\.\(\)/);
  assert.match(runtime, /root\.setupKeyboardShortcuts\?\.\(\)/);
  assert.match(runtime, /root\._navigateTo\?\.\('dashboard'\)/);
});

test('canonical navigation module owns desktop navigation only', () => {
  assert.match(navigation, /\.revamp-nav-item\[data-target\]/);
  assert.match(navigation, /root\.setupNavigation = setupNavigation/);
  assert.match(navigation, /root\.setupKeyboardShortcuts = setupKeyboardShortcuts/);
  assert.match(navigation, /root\._navigateTo = navigateTo/);
  assert.match(navigation, /root\.PlannkeNavigation/);
  assert.doesNotMatch(navigation, /planner-pill-nav|mobile-tab-btn|mobileNav/);
  assert.doesNotMatch(navigation, /\.innerHTML\s*=/);
  assert.doesNotMatch(navigation, /\beval\s*\(|new\s+Function\s*\(/);
});

test('canonical app runtime loads before navigation shell and boot', () => {
  const uiAt = index.indexOf('src="app-ui.js"');
  const runtimeAt = index.indexOf('src="app-runtime.js"');
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(uiAt >= 0 && runtimeAt > uiAt && navigationAt > runtimeAt);
  assert.ok(shellAt > navigationAt && bootAt > shellAt);
  assert.equal(index.indexOf('src="ui-bridge.js"'), -1);
  assert.equal(index.indexOf('src="app-actions.js"'), -1);
  assert.equal(index.indexOf('src="app.js"'), -1);
  assert.match(sw, /'\.\/app-navigation\.js'/);
  assert.doesNotMatch(sw, /'\.\/app-actions\.js'/);
  assert.match(pkg, /node --check app-navigation\.js/);
  assert.doesNotMatch(pkg, /node --check app-actions\.js/);
});

test('canonical data actions are ready before interaction', () => {
  assert.match(navigation, /function loadDataActions\(/);
  assert.match(navigation, /script\.src = 'app-data\.js'/);
  assert.match(navigation, /root\.PlannkeDataReady = dataActionsReady/);
  assert.match(navigation, /\['confirmClearData', 'exportToExcel'\]/);
  assert.match(navigation, /dataActionsReady[\s\S]*api\?\.\[action\]/);
  assert.match(dataActions, /root\.confirmClearData = confirmClearData/);
  assert.match(dataActions, /root\.exportToExcel = exportToExcel/);
  assert.match(sw, /'\.\/app-data\.js'/);
  assert.match(pkg, /node --check app-data\.js/);
});

test('canonical navigation exposes every primary workspace target', () => {
  ['dashboard', 'movimentacao', 'projecao', 'accounts', 'backup'].forEach(target => {
    assert.match(navigation, new RegExp(`navigateTo\\('${target}'\\)|dataset\\.target`));
  });
  assert.match(navigation, /document\.getElementById\(`\$\{target\}-view`\)/);
});
