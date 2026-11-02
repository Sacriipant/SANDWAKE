#!/usr/bin/env node
/**
 * Build script: bundles SandWake into a single self-contained HTML file (dist/index.html).
 *
 * The game has no runtime dependency except Three.js, which the page loads from a CDN. The build therefore only
 * needs to concatenate the sources and inline them into the HTML template:
 *
 *   1. src/sim.js, shaders.js, avatar.js, music.js and i18n.js are concatenated in that order. They are plain
 *      scripts that share the global scope, so the order follows their dependencies.
 *   2. src/game/*.js are concatenated in file-name order and wrapped in one function scope: this is the game itself.
 *   3. src/styles.css is inlined, with the Tifinagh font (assets/tfng.woff2) embedded as a base64 data URI.
 *
 * Usage: node scripts/build.js [--out <directory>]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Top-level scripts, in dependency order. */
const LIBRARY_FILES = ['sim.js', 'shaders.js', 'avatar.js', 'music.js', 'i18n.js'];

const read = (...segments) => fs.readFileSync(path.join(...segments), 'utf8');

/** Replaces `marker` in `template` by `value`. The replacement is literal (no `$` patterns) and must match once. */
function inject(template, marker, value) {
  if (template.split(marker).length !== 2) throw new Error(`Expected exactly one ${marker} placeholder`);
  return template.replace(marker, () => value);
}

/** Returns the game closure: every file of src/game, in file-name order, inside a strict-mode function scope. */
function buildGameClosure() {
  const parts = fs
    .readdirSync(path.join(SRC, 'game'))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => read(SRC, 'game', name));
  return `(function () {\n'use strict';\n${parts.join('\n')}\n})();\n`;
}

/** Returns the complete JavaScript bundle (libraries followed by the game closure). */
function buildScript() {
  const script = LIBRARY_FILES.map((name) => read(SRC, name)).join('\n') + '\n' + buildGameClosure();
  if (/<\/script/i.test(script)) throw new Error('The bundle must not contain a closing script tag');
  return script;
}

/** Returns the stylesheet with the Tifinagh font embedded. */
function buildStyles() {
  const font = fs.readFileSync(path.join(ROOT, 'assets', 'tfng.woff2')).toString('base64');
  return inject(read(SRC, 'styles.css'), '/*__TFNG_BASE64__*/', font);
}

/** Returns the complete HTML page. */
function buildPage() {
  let page = read(SRC, 'template.html');
  page = inject(page, '/*__STYLES__*/', buildStyles());
  page = inject(page, '/*__SCRIPT__*/', buildScript());
  return page;
}

function main() {
  const outFlag = process.argv.indexOf('--out');
  const outDir = outFlag > 0 ? path.resolve(process.argv[outFlag + 1]) : path.join(ROOT, 'dist');
  const page = buildPage();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
  console.log(`index.html  ${(page.length / 1024).toFixed(1)} KiB  ->  ${path.relative(process.cwd(), outDir) || '.'}`);
}

if (require.main === module) main();

module.exports = { buildPage, buildScript, buildStyles, buildGameClosure };
