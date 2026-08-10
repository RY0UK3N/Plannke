const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical boot owns StorageAdapter readiness and application start', () => {
  assert.match(boot, /function waitForStorageReady\(/);
  assert.match(boot, /script\.src = 'storage-adapter\.js'/);
  assert.match(boot, /const applicationInit = root\?\.initApp/);
  assert.match(boot, /const storageReady = loadStorageAdapter\(\)/);
  assert.match(boot, /function startApplication\(\)/);
  assert.match(boot, /storageReady[\s\S]*applicationInit\.call\(root\)/);
  assert.match(boot, /root\.PlannkeBoot = api/);
});

test('UI bridge no longer owns persistence readiness application start or shell construction', () => {
  assert.doesNotMatch(bridge, /function waitForStorageReady\(/);
  assert.doesNotMatch(bridge, /function loadStorageAdapter\(/);
  assert.doesNotMatch(bridge, /function loadStorageUiAssets\(/);
  assert.doesNotMatch(bridge, /const storageReady = loadStorageAdapter\(\)/);
  assert.doesNotMatch(bridge, /function startApplication\(\)/);
  assert.doesNotMatch(bridge, /const applicationInit = root\?\.initApp/);
  assert.doesNotMatch(bridge, /storage-adapter\.js|storage-ui\.js/);
  assert.doesNotMatch(bridge, /primeCanonicalShell|loadRevampAssets|loadDesktopAssets/);
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.match(shell, /function loadRevampAssets\(/);
  assert.match(bridge, /api\.init\(\);/);
});

test('boot loads after navigation shell and compatibility bridge are installed', () => {
  const runtimeAt = index.indexOf('src="app-runtime.js"');
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const bridgeAt = index.indexOf('src="ui-bridge.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  const renderersAt = index.indexOf('src="safe-renderers.js"');
  assert.ok(runtimeAt >= 0 && navigationAt > runtimeAt);
  assert.ok(shellAt > navigationAt && bridgeAt > shellAt && bootAt > bridgeAt && renderersAt > bootAt);
  assert.match(navigation, /const legacyInitApp = root\.initApp/);
});

test('canonical boot and shell are syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-shell\.js/);
  assert.match(pkg, /node --check app-boot\.js/);
  assert.match(sw, /plannke-shell-v31/);
  assert.match(sw, /'\.\/app-shell\.js'/);
  assert.match(sw, /'\.\/app-boot\.js'/);
});

test('one-time app boot extraction artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'extract-app-boot-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'extract-app-boot-once.yml')), false);
});
