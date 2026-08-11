const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const oldRuntime = path.join(root, 'revamp.js');
const newRuntime = path.join(root, 'app-presentation.js');
const selfPath = __filename;
const workflowPath = path.join(root, '.github', 'workflows', 'promote-presentation-runtime-once.yml');
const contractPath = path.join(root, 'tests', 'presentation-runtime-name.test.js');

if (!fs.existsSync(oldRuntime)) throw new Error('revamp.js is missing before runtime promotion');
if (fs.existsSync(newRuntime)) throw new Error('app-presentation.js already exists before runtime promotion');

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

let runtimePathRefs = 0;
let globalRefs = 0;
let cacheRefs = 0;
for (const file of walk(root)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  runtimePathRefs += source.split('revamp.js').length - 1;
  globalRefs += source.split('PlannkeRevamp').length - 1;
  cacheRefs += source.split('plannke-shell-v33').length - 1;
  source = source
    .replaceAll('revamp.js', 'app-presentation.js')
    .replaceAll('PlannkeRevamp', 'PlannkePresentation')
    .replaceAll('plannke-shell-v33', 'plannke-shell-v34');
  if (source !== before) fs.writeFileSync(file, source);
}

if (runtimePathRefs < 3) throw new Error(`Unexpectedly few revamp.js references: ${runtimePathRefs}`);
if (globalRefs < 1) throw new Error(`No PlannkeRevamp reference found to promote`);
if (cacheRefs < 1) throw new Error(`No plannke-shell-v33 reference found to bump`);

fs.renameSync(oldRuntime, newRuntime);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('revamp.js')) throw new Error(`Stale revamp.js reference in ${path.relative(root, file)}`);
  if (source.includes('PlannkeRevamp')) throw new Error(`Stale PlannkeRevamp reference in ${path.relative(root, file)}`);
}

console.log(`Promoted presentation runtime: ${runtimePathRefs} path refs, ${globalRefs} global refs, ${cacheRefs} cache refs updated.`);
