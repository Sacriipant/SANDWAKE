#!/usr/bin/env node
/**
 * Lints the complete game bundle.
 *
 * The files in src/ share one global scope at runtime, so cross-file checks (undefined names, unused declarations)
 * only make sense on the concatenated bundle. This script builds it in memory and runs ESLint on the result.
 */
'use strict';

const { ESLint } = require('eslint');
const js = require('@eslint/js');
const globals = require('globals');
const { buildScript } = require('./build.js');

async function main() {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      js.configs.recommended,
      {
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'script',
          globals: { ...globals.browser, THREE: 'readonly', module: 'writable' }
        },
        rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] }
      }
    ]
  });
  const [result] = await eslint.lintText(buildScript(), { filePath: 'bundle.js' });
  const formatter = await eslint.loadFormatter('stylish');
  const output = await formatter.format([result]);
  if (output) console.log(output);
  if (result.errorCount + result.warningCount > 0) process.exit(1);
  console.log('bundle.js: no lint problems');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
