const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const dataActions = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('navigation and keyboard shortcuts no longer live in the app monolith', () => {
  assert.doesNotMatch(app, /function setupNavigation\s*\(/);
  assert.doesNotMatch(app, /function setupKeyboardShortcuts\s*\(/);
  assert.doesNotMatch(app, /function _navigateTo\s*\(/);
  assert.doesNotMatch(app, /function mobileNav\s*\(/);
  assert.match(app, /setupNavigation\(\)/);
  assert.match(app, /setupKeyboardShortcuts\(\)/);
  assert.match(app, /_navigateTo\('dashboard'\)/);
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

test('canonical app runtime loads before navigation and the bridge starts the application', () => {
  const uiAt = index.indexOf('src="app-ui.js"');
  const runtimeAt = index.indexOf('src="app-runtime.js"');
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const bridgeAt = index.indexOf('src="ui-bridge.js"');
  assert.ok(uiAt >= 0 && runtimeAt > uiAt && navigationAt > runtimeAt && bridgeAt > navigationAt);
  assert.equal(index.indexOf('src="app.js"'), -1);
  assert.match(sw, /'\.\/app-navigation\.js'/);
  assert.match(pkg, /node --check app-navigation\.js/);
});

test('canonical data actions supersede legacy app actions before interaction', () => {
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
