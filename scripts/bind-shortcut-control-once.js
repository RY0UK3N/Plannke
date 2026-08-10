const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const navigationPath = path.join(root, 'app-navigation.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-shortcut-control-once.yml');
const selfPath = __filename;

let html = fs.readFileSync(htmlPath, 'utf8');
const shortcutAttr = /<button([^>]*?)data-plannke-onclick="bootstrap\.Modal\.getOrCreateInstance\(document\.getElementById\('shortcutsModal'\)\)\.show\(\)"([^>]*?)>/g;
const shortcutMatches = [...html.matchAll(shortcutAttr)];
if (shortcutMatches.length !== 1) throw new Error(`Expected one shortcut compatibility button, found ${shortcutMatches.length}.`);
html = html.replace(shortcutAttr, (_match, before, after) => `<button${before}id="settings-shortcuts"${after}>`);
if (html.includes('data-plannke-onclick="bootstrap.Modal.getOrCreateInstance(document.getElementById(\'shortcutsModal\')).show()"')) throw new Error('Shortcut compatibility attribute survived.');
fs.writeFileSync(htmlPath, html);

let navigation = fs.readFileSync(navigationPath, 'utf8');
const setupPattern = /(function setupKeyboardShortcuts\(\) \{\s*if \(shortcutsBound\) return;\s*shortcutsBound = true;)/;
const setupMatches = navigation.match(setupPattern);
if (!setupMatches) throw new Error('Could not locate setupKeyboardShortcuts idempotent guard.');
const binding = `\n        document.getElementById('settings-shortcuts')?.addEventListener('click', () => {\n            const modal = document.getElementById('shortcutsModal');\n            if (modal && root.bootstrap?.Modal) root.bootstrap.Modal.getOrCreateInstance(modal).show();\n        });`;
navigation = navigation.replace(setupPattern, `$1${binding}`);
if ((navigation.match(/settings-shortcuts/g) || []).length !== 1) throw new Error('Shortcut listener was not installed exactly once.');
fs.writeFileSync(navigationPath, navigation);

let actions = fs.readFileSync(actionsPath, 'utf8');
const specialPattern = /^\s*if \(\/\^bootstrap\\\.Modal.*shortcutsModal.*return 'shortcuts';\s*$/m;
if (!specialPattern.test(actions)) throw new Error('Shortcut specialKind marker not found.');
actions = actions.replace(specialPattern, '');
const dispatchPattern = /\n\s*if \(kind === 'shortcuts'\) \{[\s\S]*?\n\s*return true;\n\s*\}/;
if (!dispatchPattern.test(actions)) throw new Error('Shortcut dispatch block not found.');
actions = actions.replace(dispatchPattern, '');
if (/shortcutsModal|return 'shortcuts'|kind === 'shortcuts'/.test(actions)) throw new Error('Shortcut compatibility survived app-actions.js.');
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound shortcut launcher explicitly and retired its compatibility route.');
