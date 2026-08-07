const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function externalUrls(html) {
  return [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map(match => match[1]);
}

test('product layer is loaded by the application shell', () => {
  assert.match(index, /<link rel="stylesheet" href="product\.css">/);
  assert.match(index, /<script src="product-core\.js"><\/script>/);
  assert.match(index, /<script src="product\.js"><\/script>/);
  assert.ok(index.indexOf('app.js') < index.indexOf('product-core.js'));
  assert.ok(index.indexOf('product-core.js') < index.indexOf('product.js'));
});

test('third-party JavaScript dependencies are version-pinned and consolidated', () => {
  assert.match(index, /bootstrap@5\.3\.3/);
  assert.match(index, /@phosphor-icons\/web@2\.1\.2/);
  assert.match(index, /xlsx@0\.18\.5/);
  assert.match(index, /chart\.js@4\.5\.1/);
  assert.match(index, /echarts@5\.4\.3/);
  assert.doesNotMatch(index, /unpkg\.com/);
  assert.doesNotMatch(index, /cdnjs\.cloudflare\.com/);

  const scriptUrls = [...index.matchAll(/<script src="(https:\/\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(scriptUrls.length >= 4);
  scriptUrls.forEach(url => assert.equal(new URL(url).hostname, 'cdn.jsdelivr.net'));
});

test('application shell ships a restrictive compatibility CSP', () => {
  const match = index.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(match, 'CSP meta tag should exist');
  const policy = match[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
});

test('all external resources are limited to approved hosts', () => {
  const allowed = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com']);
  externalUrls(index).forEach(url => {
    assert.ok(allowed.has(new URL(url).hostname), `unexpected external host: ${url}`);
  });
});

test('PWA navigation is network-first and cache version is explicit', () => {
  assert.match(sw, /CACHE_NAME = 'plannke-shell-v3'/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  const navigationBlock = sw.slice(sw.indexOf("event.request.mode === 'navigate'"), sw.indexOf("if (url.origin === self.location.origin)"));
  assert.ok(navigationBlock.indexOf('fetch(event.request)') < navigationBlock.indexOf("caches.match('./index.html')"));
  assert.match(sw, /product-core\.js/);
  assert.match(sw, /product\.js/);
});
