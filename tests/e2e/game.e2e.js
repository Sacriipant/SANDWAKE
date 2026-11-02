/**
 * End-to-end tests: the built game (dist/index.html) is opened in headless Chromium with software WebGL.
 *
 * Prerequisites: `npm run build`, and a Chromium build for Playwright (`npx playwright install chromium`).
 * The simulation is driven through `window.__sandwake` (see src/game/17-boot.js), which advances the game without
 * rendering, so the tests stay fast even with software rendering.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser, openGame } = require('./helpers');

const LANGUAGES = ['fr', 'en', 'zh', 'ru', 'zgh'];
const VIEWPORTS = [
  { width: 1100, height: 700, mobile: false },
  { width: 390, height: 780, mobile: true }
];
const IDLE = { steer: 0, push: 0, brake: false, tuck: false, boost: false, jump: false };

let browser;
test.before(async () => {
  browser = await launchBrowser();
});
test.after(async () => {
  await browser.close();
});

/**
 * Opens the game, waits until it has booted and runs `scenario({ page, problems })`. The browser context is always
 * closed afterwards: a context left open keeps rendering and slows every following test down.
 */
async function withGame(options, scenario) {
  const { page, context, problems } = await openGame(browser, options);
  try {
    await page.waitForFunction(() => window.__sandwake !== undefined);
    return await scenario({ page, problems });
  } finally {
    await context.close();
  }
}

/** Selects a level on the intro screen and starts the game. */
async function start(page, level) {
  await page.click(`#intro .chips button[data-lv="${level}"]`);
  await page.click('#go');
  await page.waitForFunction(() => document.getElementById('intro').classList.contains('gone'));
}

for (const lang of LANGUAGES) {
  test(`intro screen in "${lang}": titled, translated and inside the viewport`, async () => {
    for (const viewport of VIEWPORTS) {
      await withGame({ lang, ...viewport }, async ({ page, problems }) => {
        const state = await page.evaluate(() => ({
          htmlLang: document.documentElement.lang,
          title: document.querySelector('#intro h1').textContent,
          lead: document.getElementById('lead').textContent,
          documentWidth: document.documentElement.scrollWidth,
          goBottom: document.getElementById('go').getBoundingClientRect().bottom,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight
        }));
        assert.equal(state.htmlLang, lang);
        assert.equal(state.title, 'SandWake');
        assert.ok(state.lead.length > 10);
        assert.ok(state.documentWidth <= state.viewportWidth, `${lang} ${viewport.width}px: horizontal overflow`);
        assert.ok(state.goBottom <= state.viewportHeight, `${lang} ${viewport.width}px: start button is off screen`);
        assert.deepEqual(problems, []);
      });
    }
  });
}

for (const level of ['jbel', 'tiziri', 'dunes']) {
  test(`level "${level}" starts and the simulation stays finite`, async () => {
    await withGame({ lang: 'en' }, async ({ page, problems }) => {
      await start(page, level);
      const result = await page.evaluate(() => {
        const game = window.__sandwake;
        for (let i = 0; i < 600; i++)
          game.headlessTick(1 / 60, { steer: 0, push: 1, brake: false, tuck: false, boost: false, jump: false });
        const { P } = game;
        return {
          finite: [P.x, P.y, P.z, P.vx, P.vy, P.vz, P.energy].every(Number.isFinite),
          speed: P.speed,
          levelHud: !document.getElementById('lvl').hidden,
          level: game.LV.id
        };
      });
      assert.equal(result.level, level);
      assert.ok(result.finite);
      assert.ok(result.speed > 3, 'the carpet picks up speed');
      assert.equal(result.levelHud, level !== 'dunes', 'the timer and progress bar belong to the two courses');
      assert.deepEqual(problems, []);
    });
  });
}

test('Jbel: falling into the canyon respawns the player and counts the fall', async () => {
  await withGame({ lang: 'en' }, async ({ page, problems }) => {
    await start(page, 'jbel');
    const result = await page.evaluate((idle) => {
      const game = window.__sandwake;
      // Hover over the gap between the first two pillars (level frame: s = 405, t = 0) and let go.
      Object.assign(game.P, { x: jbelX(405, 0), z: jbelZ(405, 0), y: 6, vx: 0, vy: 0, vz: 0 });
      for (let i = 0; i < 60 * 8; i++) game.headlessTick(1 / 60, idle);
      return { falls: game.LV.falls, y: game.P.y, finite: Number.isFinite(game.P.x + game.P.y + game.P.z) };
    }, IDLE);
    assert.ok(result.finite);
    assert.equal(result.falls, 1);
    assert.ok(result.y > -22, 'the player is back on a pillar');
    assert.deepEqual(problems, []);
  });
});

test('Tiziri: an autopilot flies through the twelve gates and the dawn rises', async () => {
  await withGame({ lang: 'en' }, async ({ page, problems }) => {
    await start(page, 'tiziri');
    const run = await page.evaluate((idle) => {
      const game = window.__sandwake;
      const { P, LV } = game;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const dt = 1 / 60;
      game.resetPlayer(true);
      const nightAtStart = game.sharedUniforms.uNight.value;
      let ticks = 0;
      while (!LV.done && ticks < 60 * 240) {
        const gate = TIZIRI.gates[Math.min(LV.cp, TIZIRI.gates.length - 1)];
        const steer = clamp(2.2 * wrapPI(P.h - Math.atan2(gate[0] - P.x, gate[2] - P.z)), -1, 1);
        const boost = P.energy > 0.3 && P.speed < 78;
        game.headlessTick(dt, { ...idle, steer, push: 1, boost });
        ticks++;
      }
      const gates = LV.cp;
      for (let i = 0; i < 60 * 15; i++) game.headlessTick(dt, { ...idle, push: 1 });
      return {
        done: LV.done,
        gates,
        seconds: LV.tEnd,
        nightAtStart,
        nightAtEnd: game.sharedUniforms.uNight.value,
        finite: Number.isFinite(P.x + P.y + P.z)
      };
    }, IDLE);
    assert.ok(run.finite);
    assert.ok(run.done, `the course must be completed (gates passed: ${run.gates})`);
    assert.equal(run.gates, 12);
    assert.ok(run.seconds > 20 && run.seconds < 240, `completion time ${run.seconds}`);
    assert.ok(run.nightAtStart > 0.9, 'Tiziri starts at night');
    assert.ok(run.nightAtEnd < run.nightAtStart - 0.3, 'the night fades after the golden gate');
    assert.deepEqual(problems, []);
  });
});

test('settings panel: language and quality buttons update the page', async () => {
  await withGame({ lang: 'en' }, async ({ page, problems }) => {
    await start(page, 'dunes');
    await page.click('#gear');
    await page.click('#panel .langs button[data-l="zgh"]');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'zgh');
    const pressed = await page.evaluate(
      () => document.querySelector('#panel .langs button[aria-pressed="true"]').dataset.l
    );
    assert.equal(pressed, 'zgh');
    await page.click('#panel #qual button[data-q="med"]');
    assert.equal(await page.evaluate(() => window.__sandwake.S.quality), 'med');
    assert.deepEqual(problems, []);
  });
});
