const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor');

test('vendored runtime versions are the reviewed pinned releases', () => {
  const bootstrapCss = fs.readFileSync(path.join(vendor, 'bootstrap.min.css'), 'utf8');
  const bootstrapJs = fs.readFileSync(path.join(vendor, 'bootstrap.bundle.min.js'), 'utf8');
  const sheetjs = fs.readFileSync(path.join(vendor, 'xlsx.full.min.js'), 'utf8');
  const chart = fs.readFileSync(path.join(vendor, 'chart.umd.min.js'), 'utf8');
  const echarts = fs.readFileSync(path.join(vendor, 'echarts.min.js'), 'utf8');
  assert.match(bootstrapCss, /Bootstrap\s+v5\.3\.3/);
  assert.match(bootstrapJs, /Bootstrap\s+v5\.3\.3/);
  assert.ok(sheetjs.includes('0.20.3'), 'SheetJS 0.20.3 marker missing');
  assert.ok(chart.includes('4.5.1'), 'Chart.js 4.5.1 marker missing');
  assert.ok(echarts.includes('5.4.3'), 'ECharts 5.4.3 marker missing');
});

test('vendor manifest matches the committed runtime and license files', () => {
  const manifest = fs.readFileSync(path.join(vendor, 'manifest.sha384'), 'utf8').trim().split(/\n+/);
  assert.ok(manifest.length >= 10);
  manifest.forEach(line => {
    const match = line.match(/^([a-f0-9]{96})\s+(.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    const relative = match[2].replace(/^\.\//, '');
    const bytes = fs.readFileSync(path.join(vendor, relative));
    const actual = crypto.createHash('sha384').update(bytes).digest('hex');
    assert.equal(actual, match[1], `hash mismatch for ${relative}`);
  });
});
