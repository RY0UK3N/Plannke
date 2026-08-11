const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const selfPath = __filename;
const workflowPath = path.join(root, '.github', 'workflows', 'promote-presentation-selectors-once.yml');
const contractPath = path.join(root, 'tests', 'presentation-selector-names.test.js');
const oldShellTest = path.join(root, 'tests', 'revamp-shell.test.js');
const newShellTest = path.join(root, 'tests', 'presentation-shell.test.js');

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

let prefixRefs = 0;
let rootClassRefs = 0;
let cacheRefs = 0;
for (const file of walk(root)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  prefixRefs += source.split('revamp-').length - 1;
  rootClassRefs += source.split('plannke-revamp').length - 1;
  cacheRefs += source.split('plannke-shell-v37').length - 1;
  source = source
    .replaceAll('plannke-revamp', 'plannke-presentation')
    .replaceAll('revamp-', 'presentation-')
    .replaceAll('plannke-shell-v37', 'plannke-shell-v38');
  if (source !== before) fs.writeFileSync(file, source);
}

if (prefixRefs < 100) throw new Error(`Unexpectedly few revamp-* references: ${prefixRefs}`);
if (rootClassRefs < 5) throw new Error(`Unexpectedly few plannke-revamp references: ${rootClassRefs}`);
if (cacheRefs < 1) throw new Error('PWA cache v37 reference not found');
if (!fs.existsSync(oldShellTest)) throw new Error('revamp-shell.test.js missing before promotion');
if (fs.existsSync(newShellTest)) throw new Error('presentation-shell.test.js already exists before promotion');
fs.renameSync(oldShellTest, newShellTest);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('revamp-')) throw new Error(`Stale revamp-* identifier in ${path.relative(root, file)}`);
  if (source.includes('plannke-revamp')) throw new Error(`Stale plannke-revamp class in ${path.relative(root, file)}`);
}

console.log(`Promoted presentation selectors: ${prefixRefs} revamp-* refs, ${rootClassRefs} root-class refs, ${cacheRefs} cache refs.`);
