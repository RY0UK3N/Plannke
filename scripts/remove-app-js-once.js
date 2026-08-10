const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const packagePath = path.join(root, 'package.json');
const securityPath = path.join(root, 'tests', 'security-shell.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'remove-app-js-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let security = fs.readFileSync(securityPath, 'utf8');
security = replaceExact(
  security,
  "const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');",
  "const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');\nconst ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');",
  'security app source declaration'
);
security = replaceExact(
  security,
  "  assert.ok(index.indexOf('app.js') < index.indexOf('ui-bridge.js'));",
  "  assert.equal(index.indexOf('app.js'), -1);\n  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('ui-bridge.js'));",
  'security shell boot order'
);
security = replaceExact(
  security,
  `  assert.doesNotMatch(app, /document\\.addEventListener\\(['\"]DOMContentLoaded['\"][\\s\\S]*initApp/);\n  assert.doesNotMatch(app, /planner_autosave|planner_session_cache|loadFromLocalStorage|checkImportPrompt|setupBeforeUnload/);`,
  `  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);\n  assert.doesNotMatch(runtime, /document\\.addEventListener\\(['\"]DOMContentLoaded['\"][\\s\\S]*initApp/);\n  assert.doesNotMatch(runtime, /planner_autosave|planner_session_cache|loadFromLocalStorage|checkImportPrompt|setupBeforeUnload/);\n  assert.doesNotMatch(ui, /planner_autosave|planner_session_cache|loadFromLocalStorage|checkImportPrompt|setupBeforeUnload/);`,
  'security retired boot assertions'
);
fs.writeFileSync(securityPath, security);

if (!fs.existsSync(appPath)) throw new Error('app.js is already absent; refusing ambiguous removal.');
fs.unlinkSync(appPath);

let pkg = fs.readFileSync(packagePath, 'utf8');
const marker = ' && node --check app.js';
if (!pkg.includes(marker)) throw new Error('package.json no longer syntax-checks app.js at expected marker.');
pkg = pkg.replace(marker, '');
if (pkg.includes('node --check app.js')) throw new Error('app.js syntax check survived package cleanup.');
fs.writeFileSync(packagePath, pkg);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Removed app.js, migrated shell security assertions, and removed its syntax-check entry.');
