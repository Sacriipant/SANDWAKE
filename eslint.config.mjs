import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    // Game sources: plain scripts that share one scope once bundled (see scripts/build.js). Names defined in
    // another file look undefined here, so these two rules only run on the bundle (scripts/lint-bundle.js).
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, THREE: 'readonly', module: 'writable' }
    },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-redeclare': 'off' }
  },
  {
    // The fragments of src/game are wrapped in a function by the build, so top-level `return` is legal there.
    files: ['src/game/**/*.js'],
    languageOptions: { parserOptions: { ecmaFeatures: { globalReturn: true } } }
  },
  {
    // Build scripts and tests run on Node.
    files: ['scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    // The functions passed to page.evaluate() run in the browser, where the game's global names exist.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        jbelX: 'readonly',
        jbelZ: 'readonly',
        TIZIRI: 'readonly',
        wrapPI: 'readonly'
      }
    }
  }
];
