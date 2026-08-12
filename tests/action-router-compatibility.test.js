const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'src', 'app', 'insights.js'), 'utf8');

test('static shell contains no executable compatibility actions', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'ui-bridge.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
  assert.doesNotMatch(index, /data-plannke-(?:onclick|onchange|oninput)=/);
  assert.doesNotMatch(index, /\s(?:onclick|onchange|oninput)=/);
});

test('retired action router is absent from shell cache CI and fallback loaders', () => {
  [index, sw, pkg, insights].forEach(source => assert.doesNotMatch(source, /app-actions\.js|data-plannke-actions|PlannkeActions/));
  assert.match(sw, /plannke-shell-v40/);
});

test('canonical owners use explicit event listeners instead of encoded handler source', () => {
  const ownerFiles = [
    'app-shell.js', 'app-navigation.js', 'app-transactions.js', 'app-movements.js',
    'app-dashboard.js', 'app-entities.js', 'app-settings.js', 'app-data.js', 'safe-renderers.js'
  ];
  const owners = ownerFiles.map(file => fs.readFileSync(path.join(root, 'src', 'app', file), 'utf8'));
  assert.ok(owners.some(source => /addEventListener\(/.test(source)));
  owners.forEach(source => {
    assert.doesNotMatch(source, /setAttribute\(['"]on(?:click|change|input)['"]/);
    assert.doesNotMatch(source, /dataset\.plannkeOn(?:click|change|input)/);
    assert.doesNotMatch(source, /app-actions\.js|data-plannke-actions|PlannkeActions/);
  });
});

test('one-time action retirement artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-actions-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-actions-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-inline-handler-migration-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-inline-handler-migration-once.yml')), false);
});
