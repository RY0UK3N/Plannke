const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const revamp = fs.readFileSync(path.join(root, 'revamp.js'), 'utf8');
const accountsCss = fs.readFileSync(path.join(root, 'revamp-accounts.css'), 'utf8');
const formsCss = fs.readFileSync(path.join(root, 'revamp-forms.css'), 'utf8');

function externalUrls(html) {
  return [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map(match => match[1]);
}

test('product layer, UI bridge and safe renderers are loaded in the required order', () => {
  assert.match(index, /<link rel="stylesheet" href="product\.css">/);
  assert.match(index, /<script src="ui-bridge\.js" data-plannke-ui-bridge="true"><\/script>/);
  assert.match(index, /<script src="safe-renderers\.js"><\/script>/);
  assert.match(index, /<script src="product-core\.js"><\/script>/);
  assert.match(index, /<script src="product\.js"><\/script>/);
  assert.ok(index.indexOf('app.js') < index.indexOf('ui-bridge.js'));
  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('safe-renderers.js'));
  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product-core.js'));
  assert.ok(index.indexOf('product-core.js') < index.indexOf('product.js'));
  assert.match(product, /script\.src = 'insights\.js'/);
  assert.match(insights, /bridge\.src = '\.\/ui-bridge\.js'/);
});

test('revamp assets are loaded from trusted local scripts', () => {
  assert.match(bridge, /stylesheet\.href = 'revamp\.css'/);
  assert.match(bridge, /script\.src = 'revamp\.js'/);
  assert.match(bridge, /loadRevampAssets\(\)/);
  assert.match(revamp, /revamp-dashboard\.css/);
  assert.match(revamp, /revamp-movements\.css/);
  assert.match(revamp, /revamp-planning\.css/);
  assert.match(revamp, /revamp-accounts\.css/);
  assert.match(accountsCss, /@import url\('\.\/revamp-forms\.css'\)/);
  assert.match(formsCss, /@import url\('\.\/revamp-states\.css'\)/);
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

test('application shell blocks inline script execution', () => {
  const match = index.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(match, 'CSP meta tag should exist');
  const policy = match[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  const scriptPolicy = policy.match(/script-src[^;]*/)?.[0] || '';
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'/);
  assert.doesNotMatch(scriptPolicy, /'unsafe-eval'/);
});

test('all external resources are limited to approved hosts', () => {
  const allowed = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com']);
  externalUrls(index).forEach(url => {
    assert.ok(allowed.has(new URL(url).hostname), `unexpected external host: ${url}`);
  });
});

test('PWA navigation is network-first and all revamp assets are cached', () => {
  assert.match(sw, /CACHE_NAME = 'plannke-shell-v13'/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  const navigationBlock = sw.slice(sw.indexOf("event.request.mode === 'navigate'"), sw.indexOf("if (url.origin === self.location.origin)"));
  assert.ok(navigationBlock.indexOf('fetch(event.request)') < navigationBlock.indexOf("caches.match('./index.html')"));
  assert.match(sw, /product-core\.js/);
  assert.match(sw, /product\.js/);
  assert.match(sw, /insights\.js/);
  assert.match(sw, /ui-bridge\.js/);
  assert.match(sw, /safe-renderers\.js/);
  assert.match(sw, /revamp\.js/);
  assert.match(sw, /revamp\.css/);
  assert.match(sw, /revamp-dashboard\.css/);
  assert.match(sw, /revamp-movements\.css/);
  assert.match(sw, /revamp-planning\.css/);
  assert.match(sw, /revamp-accounts\.css/);
  assert.match(sw, /revamp-forms\.css/);
  assert.match(sw, /revamp-states\.css/);
});
