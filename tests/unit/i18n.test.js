/** Unit tests for src/i18n.js: every language must be complete, consistent and selectable. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { I18N, LANGS } = require('../../src/i18n.js');

const REFERENCE = Object.keys(I18N.en).sort();

/** Loads i18n.js in a sandbox that pretends the browser reports `languages`, and returns pickLang. */
function pickLangFor(languages, saved = null) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.js'), 'utf8');
  const sandbox = { navigator: { languages }, module: { exports: {} } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports.pickLang(saved);
}

test('every language in LANGS has a string table, and every table is listed', () => {
  assert.deepEqual([...LANGS].sort(), Object.keys(I18N).sort());
});

test('all languages define exactly the same keys as English', () => {
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(I18N[lang]).sort(), REFERENCE, `keys of "${lang}"`);
  }
});

test('no string is empty and placeholders are kept', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(I18N[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key}`);
      assert.ok(value.length > 0, `${lang}.${key} is empty`);
      const placeholders = (text) => (text.match(/\{n\}/g) || []).length;
      assert.equal(placeholders(value), placeholders(I18N.en[key]), `${lang}.${key} placeholders`);
    }
  }
});

test('the game title is the same in every language', () => {
  for (const lang of LANGS) assert.equal(I18N[lang].title, 'SandWake');
});

test('pickLang: a saved language wins, an unknown one is ignored', () => {
  assert.equal(pickLangFor(['fr-FR'], 'ru'), 'ru');
  assert.equal(pickLangFor(['fr-FR'], 'xx'), 'fr');
});

test('pickLang: follows the browser language list and falls back to English', () => {
  assert.equal(pickLangFor(['zh-CN', 'en']), 'zh');
  assert.equal(pickLangFor(['de-DE', 'ru-RU']), 'ru');
  assert.equal(pickLangFor(['de-DE']), 'en');
  assert.equal(pickLangFor([]), 'en');
});

test('pickLang: every Amazigh language code selects the Tifinagh interface', () => {
  for (const tag of ['zgh', 'tzm-MA', 'shi-Tfng', 'rif', 'ber-DZ']) assert.equal(pickLangFor([tag]), 'zgh', tag);
});
