const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');

test('app-shell is the only runtime that constructs the canonical desktop shell', () => {
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.match(shell, /shell\.id = 'presentation-shell'/);
  assert.doesNotMatch(presentation, /function buildShell\(/);
  assert.doesNotMatch(presentation, /function createSidebar\(/);
  assert.doesNotMatch(presentation, /function createNavigation\(/);
  assert.doesNotMatch(presentation, /function createTopbar\(/);
  assert.doesNotMatch(presentation, /function createBrand\(/);
  const initBody = presentation.match(/function init\(\) \{([\s\S]*?)\r?\n    \}\r?\n\r?\n    root\.PlannkePresentation/);
  assert.ok(initBody, 'presentation init should stay detectable');
  assert.doesNotMatch(initBody[1], /buildShell\s*\(/);
});

test('presentation navigation delegates only to the canonical navigation boundary', () => {
  assert.match(presentation, /function navigate\(target\)[\s\S]*root\._navigateTo\(target\)/);
  assert.doesNotMatch(presentation, /findLegacyNavigation/);
  assert.doesNotMatch(presentation, /planner-pill-nav/);
  assert.doesNotMatch(presentation, /\.click\(\)[\s\S]*syncPage/);
});

test('data workspace copy no longer revives retired Backup or Memory Card product language', () => {
  assert.match(presentation, /backup:\s*\{[\s\S]*label: 'Dados'/);
  assert.match(presentation, /backup:\s*\{[\s\S]*title: 'Dados e relatórios'/);
  assert.doesNotMatch(presentation, /label: 'Backup'/);
  assert.doesNotMatch(presentation, /eyebrow: 'Memory Card'/);
  assert.doesNotMatch(presentation, /title: 'Backup e importação'/);
});

test('one-time presentation boundary migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-duplicate-presentation-shell-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-duplicate-presentation-shell-once.yml')), false);
});
