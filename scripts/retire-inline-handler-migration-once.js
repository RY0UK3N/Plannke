const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const bridgePath = path.join(root, 'ui-bridge.js');
const uiBridgeTestPath = path.join(root, 'tests', 'ui-bridge.test.js');
const swPath = path.join(root, 'sw.js');
const versionedTests = [
  path.join(root, 'tests', 'app-boot.test.js'),
  path.join(root, 'tests', 'canonical-ui-runtime.test.js'),
  path.join(root, 'tests', 'security-shell.test.js')
];
const workflowPath = path.join(root, '.github', 'workflows', 'retire-inline-handler-migration-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(indexPath, 'utf8');
const inlinePattern = /\s(onclick|onchange|oninput)="([^"]*)"/g;
const inlineMatches = [...html.matchAll(inlinePattern)];
if (inlineMatches.length < 20) throw new Error(`Expected at least 20 inline compatibility handlers, found ${inlineMatches.length}.`);
html = html.replace(inlinePattern, (_match, attr, code) => ` data-plannke-${attr}="${code}"`);
if (/\s(?:onclick|onchange|oninput)="/.test(html)) throw new Error('Executable inline event attributes survived index migration.');
if ((html.match(/data-plannke-(?:onclick|onchange|oninput)=/g) || []).length !== inlineMatches.length) {
  throw new Error('Compatibility handler count changed during static migration.');
}
fs.writeFileSync(indexPath, html);

let bridge = fs.readFileSync(bridgePath, 'utf8');
bridge = replaceExact(bridge, "    const EVENT_ATTRS = ['onclick', 'onchange', 'oninput'];\n", '', 'EVENT_ATTRS declaration');
bridge = replaceExact(
  bridge,
  `    // Temporary vocabulary for inline handlers that still live inside the\n    // remaining workspace markup/renderers. This set shrinks as UI modules\n    // move to explicit addEventListener bindings.`,
  `    // Temporary compatibility vocabulary for static data-plannke actions.\n    // This shrinks as each workspace moves to explicit addEventListener bindings.`,
  'compatibility vocabulary comment'
);
const migrateStart = bridge.indexOf('    function migrateElement(element) {');
const delegatedStart = bridge.indexOf('    function handleDelegated(event, sourceAttr) {', migrateStart);
if (migrateStart < 0 || delegatedStart < 0 || delegatedStart <= migrateStart) throw new Error('Could not locate migrateElement block.');
bridge = bridge.slice(0, migrateStart) + bridge.slice(delegatedStart);
bridge = replaceExact(bridge, '        migrateElement(document.documentElement);\n\n', '', 'initial DOM migration call');
const observerBlock = `\n        const observer = new MutationObserver(records => {\n            records.forEach(record => record.addedNodes.forEach(node => migrateElement(node)));\n        });\n        observer.observe(document.documentElement, { childList: true, subtree: true });`;
bridge = replaceExact(bridge, observerBlock, '', 'inline migration MutationObserver');
bridge = replaceExact(bridge, '        migrateElement,\n', '', 'migrateElement API export');
['EVENT_ATTRS', 'migrateElement', 'new MutationObserver'].forEach(marker => {
  if (bridge.includes(marker)) throw new Error(`Retired inline migration marker survived ui-bridge.js: ${marker}`);
});
fs.writeFileSync(bridgePath, bridge);

let bridgeTest = fs.readFileSync(uiBridgeTestPath, 'utf8');
bridgeTest = replaceExact(
  bridgeTest,
  `function extractHandlers(content) {\n  const handlers = [];\n  const re = /\\b(onclick|onchange|oninput)\\s*=\\s*\"([^\"]*)\"/g;\n  let match;\n  while ((match = re.exec(content))) handlers.push({ attr: match[1], code: match[2] });\n  return handlers;\n}`,
  `function extractHandlers(content) {\n  const handlers = [];\n  const re = /\\bdata-plannke-(onclick|onchange|oninput)\\s*=\\s*\"([^\"]*)\"/g;\n  let match;\n  while ((match = re.exec(content))) handlers.push({ attr: match[1], code: match[2] });\n  return handlers;\n}`,
  'handler inventory parser'
);
bridgeTest = replaceExact(
  bridgeTest,
  "test('UI bridge recognizes every inline handler still awaiting migration in the canonical shell', () => {",
  "test('UI bridge recognizes every static compatibility action in the canonical shell', () => {",
  'handler inventory test title'
);
bridgeTest = replaceExact(
  bridgeTest,
  "  assert.ok(count > 20, 'expected to inventory the remaining compatibility handlers');\n  assert.deepEqual(unknown, []);",
  "  assert.ok(count > 20, 'expected to inventory the remaining compatibility actions');\n  assert.deepEqual(unknown, []);\n  sources.forEach(source => assert.doesNotMatch(source.content, /\\s(?:onclick|onchange|oninput)=/));",
  'handler inventory assertions'
);
bridgeTest = replaceExact(
  bridgeTest,
  "test('inline argument parser only accepts the migration vocabulary', () => {",
  "test('compatibility argument parser only accepts the allowlisted vocabulary', () => {",
  'parser test title'
);
bridgeTest = `${bridgeTest.trimEnd()}\n\ntest('UI bridge no longer scans or observes the DOM for executable attributes', () => {\n  const source = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');\n  assert.doesNotMatch(source, /EVENT_ATTRS|migrateElement|new MutationObserver/);\n  assert.match(source, /document\\.addEventListener\\('click'/);\n  assert.match(source, /document\\.addEventListener\\('change'/);\n  assert.match(source, /document\\.addEventListener\\('input'/);\n});\n`;
fs.writeFileSync(uiBridgeTestPath, bridgeTest);

let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceExact(sw, "const CACHE_NAME = 'plannke-shell-v29';", "const CACHE_NAME = 'plannke-shell-v30';", 'PWA cache version');
fs.writeFileSync(swPath, sw);
versionedTests.forEach(testPath => {
  let source = fs.readFileSync(testPath, 'utf8');
  if (!source.includes('plannke-shell-v29')) throw new Error(`Expected v29 assertion missing in ${path.basename(testPath)}.`);
  source = source.replaceAll('plannke-shell-v29', 'plannke-shell-v30');
  fs.writeFileSync(testPath, source);
});

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log(`Retired runtime migration for ${inlineMatches.length} inline event handlers.`);
