const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const selfPath = __filename;
const workflowPath = path.join(root, '.github', 'workflows', 'promote-presentation-stylesheets-once.yml');
const contractPath = path.join(root, 'tests', 'presentation-stylesheet-names.test.js');

const renamed = {
  'revamp.css': 'app-presentation.css',
  'revamp-dashboard.css': 'app-presentation-dashboard.css',
  'revamp-movements.css': 'app-presentation-movements.css',
  'revamp-planning.css': 'app-presentation-planning.css',
  'revamp-accounts.css': 'app-presentation-accounts.css',
  'revamp-desktop.css': 'app-presentation-desktop.css',
  'revamp-forms.css': 'app-presentation-forms.css',
  'revamp-states.css': 'app-presentation-states.css'
};

const allowedExtensions = new Set(['.js', '.json', '.html', '.md', '.yml', '.yaml', '.css', '.webmanifest']);
const excludedDirectories = new Set(['.git', 'vendor', 'node_modules']);
const excludedFiles = new Set([selfPath, workflowPath, contractPath].map(file => path.resolve(file)));

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (allowedExtensions.has(path.extname(entry.name)) && !excludedFiles.has(path.resolve(full))) out.push(full);
  }
  return out;
}

const counts = {};
for (const oldName of Object.keys(renamed)) counts[oldName] = { literal: 0, escaped: 0 };

for (const file of walk(root)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  for (const [oldName, newName] of Object.entries(renamed)) {
    const escapedOld = oldName.replaceAll('.', '\\.');
    const escapedNew = newName.replaceAll('.', '\\.');
    counts[oldName].literal += source.split(oldName).length - 1;
    counts[oldName].escaped += source.split(escapedOld).length - 1;
    source = source.replaceAll(oldName, newName).replaceAll(escapedOld, escapedNew);
  }
  source = source.replaceAll('plannke-shell-v36', 'plannke-shell-v37');
  if (source !== before) fs.writeFileSync(file, source);
}

for (const [oldName, newName] of Object.entries(renamed)) {
  const oldPath = path.join(root, oldName);
  const newPath = path.join(root, newName);
  if (!fs.existsSync(oldPath)) throw new Error(`Missing source stylesheet ${oldName}`);
  if (fs.existsSync(newPath)) throw new Error(`Destination stylesheet already exists: ${newName}`);
  fs.renameSync(oldPath, newPath);
}

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const oldName of Object.keys(renamed)) {
    const escapedOld = oldName.replaceAll('.', '\\.');
    if (source.includes(oldName) || source.includes(escapedOld)) {
      throw new Error(`Stale stylesheet filename ${oldName} in ${path.relative(root, file)}`);
    }
  }
}

const totalLiteral = Object.values(counts).reduce((sum, value) => sum + value.literal, 0);
if (totalLiteral < 20) throw new Error(`Unexpectedly few stylesheet references updated: ${totalLiteral}`);
console.log('Promoted presentation stylesheet filenames:', counts);
