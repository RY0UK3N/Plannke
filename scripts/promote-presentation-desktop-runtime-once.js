const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const oldRuntime = path.join(root, 'revamp-desktop.js');
const newRuntime = path.join(root, 'app-presentation-desktop.js');
const selfPath = __filename;
const workflowPath = path.join(root, '.github', 'workflows', 'promote-presentation-desktop-runtime-once.yml');
const contractPath = path.join(root, 'tests', 'presentation-desktop-runtime-name.test.js');

if (!fs.existsSync(oldRuntime)) throw new Error('revamp-desktop.js is missing before runtime promotion');
if (fs.existsSync(newRuntime)) throw new Error('app-presentation-desktop.js already exists before runtime promotion');

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

let runtimeRefs = 0;
let escapedRefs = 0;
let globalRefs = 0;
let cacheRefs = 0;
for (const file of walk(root)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  runtimeRefs += source.split('revamp-desktop.js').length - 1;
  escapedRefs += source.split('revamp-desktop\\.js').length - 1;
  globalRefs += source.split('PlannkeDesktop').length - 1;
  cacheRefs += source.split('plannke-shell-v34').length - 1;
  source = source
    .replaceAll('revamp-desktop.js', 'app-presentation-desktop.js')
    .replaceAll('revamp-desktop\\.js', 'app-presentation-desktop\\.js')
    .replaceAll('PlannkeDesktop', 'PlannkePresentationDesktop')
    .replaceAll('plannke-shell-v34', 'plannke-shell-v35');
  if (source !== before) fs.writeFileSync(file, source);
}

if (runtimeRefs < 3) throw new Error(`Unexpectedly few revamp-desktop.js references: ${runtimeRefs}`);
if (globalRefs < 1) throw new Error('No PlannkeDesktop reference found to promote');
if (cacheRefs < 1) throw new Error('No plannke-shell-v34 reference found to bump');

let desktop = fs.readFileSync(oldRuntime, 'utf8');
desktop = desktop.replace(
  `/* Final desktop-only product polish.\n   Keeps finance/storage handlers intact while adapting the web preview to the desktop app direction. */`,
  `/* Plannke canonical desktop presentation layer.\n   Keeps finance/storage handlers intact while adapting the web preview to the desktop app direction. */`
);
fs.writeFileSync(oldRuntime, desktop);
fs.renameSync(oldRuntime, newRuntime);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('revamp-desktop.js') || source.includes('revamp-desktop\\.js')) {
    throw new Error(`Stale revamp-desktop.js reference in ${path.relative(root, file)}`);
  }
  if (source.includes('PlannkeDesktop')) throw new Error(`Stale PlannkeDesktop reference in ${path.relative(root, file)}`);
}

console.log(`Promoted desktop presentation runtime: ${runtimeRefs} path refs, ${escapedRefs} escaped refs, ${globalRefs} global refs, ${cacheRefs} cache refs updated.`);
