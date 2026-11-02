/** Tests for scripts/build.js: the bundle must be well-formed and the page self-contained. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { buildPage, buildScript, buildStyles } = require('../../scripts/build.js');

test('the script bundle is valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(buildScript(), { filename: 'bundle.js' }));
});

test('the stylesheet embeds the Tifinagh font', () => {
  const css = buildStyles();
  assert.match(css, /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)/);
  assert.ok(!css.includes('__TFNG_BASE64__'));
});

test('the page has no unresolved placeholder and exactly one inline script and style', () => {
  const page = buildPage();
  assert.ok(!/__STYLES__|__SCRIPT__|__TFNG_BASE64__/.test(page));
  assert.equal((page.match(/<style>/g) || []).length, 1);
  assert.equal((page.match(/<script>/g) || []).length, 1);
  assert.match(page, /<title>SandWake<\/title>/);
});

test('every data-i key used by the markup exists in the string tables', () => {
  const { I18N } = require('../../src/i18n.js');
  const page = buildPage();
  const keys = new Set();
  for (const match of page.matchAll(/data-i(?:-aria)?="([A-Za-z0-9]+)"/g)) keys.add(match[1]);
  assert.ok(keys.size > 30);
  for (const key of keys) assert.ok(key in I18N.en, `missing string "${key}"`);
});
