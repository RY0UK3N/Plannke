const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const revampPath = path.join(root, 'revamp.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-duplicate-revamp-shell-once.yml');
const selfPath = __filename;

let source = fs.readFileSync(revampPath, 'utf8');

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple markers for ${label}`);
  source = source.replace(before, after);
}

replaceExact(
  `/* Plannke desktop/tablet visual shell.\n   Keeps finance logic untouched and reorganizes the existing views for larger screens. */`,
  `/* Plannke canonical presentation layer.\n   Keeps finance logic untouched and decorates the shell owned by app-shell.js. */`,
  'presentation header'
);

replaceExact(
  `        backup: {\n            label: 'Backup',\n            icon: 'ph-floppy-disk',\n            eyebrow: 'Memory Card',\n            title: 'Backup e importação',\n            subtitle: 'Leve seus dados com você e importe extratos sem conectar seu banco.'\n        }`,
  `        backup: {\n            label: 'Dados',\n            icon: 'ph-database',\n            eyebrow: 'Dados locais',\n            title: 'Dados e relatórios',\n            subtitle: 'Exporte relatórios e importe extratos para revisão sem conectar seu banco.'\n        }`,
  'data workspace copy'
);

const legacyStart = source.indexOf('    function findLegacyNavigation(target) {');
const currentTargetStart = source.indexOf('    function currentTarget() {');
if (legacyStart < 0 || currentTargetStart < 0 || currentTargetStart <= legacyStart) {
  throw new Error('Could not locate legacy navigation and duplicate shell block');
}

const canonicalNavigate = `    function navigate(target) {\n        if (typeof root._navigateTo !== 'function') return;\n        root._navigateTo(target);\n        window.setTimeout(syncPage, 0);\n    }\n\n`;
source = source.slice(0, legacyStart) + canonicalNavigate + source.slice(currentTargetStart);

replaceExact(
  `        ensureViewStyles();\n        buildShell();\n        decorateViews();`,
  `        ensureViewStyles();\n        decorateViews();`,
  'init shell construction'
);

fs.writeFileSync(revampPath, source);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired duplicate revamp shell construction and legacy navigation fallback.');
