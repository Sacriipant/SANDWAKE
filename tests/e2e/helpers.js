/**
 * Shared helpers for the end-to-end tests: launching Chromium with software WebGL and opening the game.
 *
 * The tests need the Playwright package and a Chromium build (`npx playwright install chromium`). They never touch the
 * network: Three.js is served from node_modules and web fonts are skipped, so the page falls back to system fonts.
 */
'use strict';

const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const GAME_URL = 'file://' + path.join(ROOT, 'dist', 'index.html');
const THREE_PATH = path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js');

/** Flags that make headless Chromium render WebGL in software (SwiftShader), so no GPU is needed. */
const CHROMIUM_ARGS = [
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--autoplay-policy=no-user-gesture-required'
];

/** Console messages that are expected in the offline test setup. */
const IGNORED_MESSAGES = [/ERR_FAILED/, /GPU stall/];

function launchBrowser() {
  return chromium.launch({ args: CHROMIUM_ARGS });
}

/**
 * Opens the game in a fresh browser context.
 * @param {import('playwright').Browser} browser
 * @param {{ lang?: string, quality?: string, width?: number, height?: number, mobile?: boolean, url?: string }} [options]
 * @returns {Promise<{ page: import('playwright').Page, context: import('playwright').BrowserContext, problems: string[] }>}
 *   `problems` collects console errors/warnings and uncaught exceptions raised by the page.
 */
async function openGame(browser, options = {}) {
  const { lang = 'en', quality = 'low', width = 1280, height = 720, mobile = false, url = GAME_URL } = options;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile
  });
  const page = await context.newPage();
  const problems = [];
  const record = (text) => {
    if (!IGNORED_MESSAGES.some((pattern) => pattern.test(text))) problems.push(text);
  };
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') record(`[${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => record(`[pageerror] ${error.message}`));
  await page.route('**/three.min.js', (route) =>
    route.fulfill({ path: THREE_PATH, contentType: 'application/javascript' })
  );
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.addInitScript(
    ([q, l]) => {
      localStorage.setItem('sandwake.quality', q);
      localStorage.setItem('sandwake.sound', '0');
      localStorage.setItem('sandwake.lang', l);
    },
    [quality, lang]
  );
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, context, problems };
}

module.exports = { GAME_URL, launchBrowser, openGame };
