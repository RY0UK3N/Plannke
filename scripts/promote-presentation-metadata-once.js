const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const selfPath = __filename;
const workflowPath = path.join(root, '.github', 'workflows', 'promote-presentation-metadata-once.yml');
const contractPath = path.join(root, 'tests', 'presentation-metadata.test.js');

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

const replacements = [
  ['loadRevampAssets', 'loadPresentationAssets'],
  ['data-plannke-revamp', 'data-plannke-presentation'],
  ['plannkeRevampView', 'plannkePresentationView'],
  ['plannkeRevamp', 'plannkePresentation'],
  ['revampVersion', 'presentationVersion'],
  ['revampView', 'presentationView'],
  ['plannke-shell-v35', 'plannke-shell-v36']
];

const counts = Object.fromEntries(replacements.map(([from]) => [from, 0]));
for (const file of walk(root)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  for (const [from, to] of replacements) {
    counts[from] += source.split(from).length - 1;
    source = source.replaceAll(from, to);
  }
  if (source !== before) fs.writeFileSync(file, source);
}

for (const required of ['loadRevampAssets', 'data-plannke-revamp', 'plannkeRevamp', 'revampVersion', 'revampView', 'plannke-shell-v35']) {
  if (counts[required] < 1) throw new Error(`No references found for ${required}`);
}

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [from] of replacements.slice(0, -1)) {
    if (source.includes(from)) throw new Error(`Stale ${from} reference in ${path.relative(root, file)}`);
  }
}

console.log('Promoted presentation metadata:', counts);
