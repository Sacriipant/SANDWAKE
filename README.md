# SandWake

Glide a woven carpet over endless sand dunes. SandWake is a small, lightweight 3D browser game with an Amazigh art
direction (Tifinagh letters, zigzag and lozenge motifs, a veiled rider from the Souss, a procedural pentatonic
soundtrack). It runs in any modern browser with WebGL, with no install and no asset download beyond three.js and a few
web fonts.

- **Jbel**: a bottomless canyon and five pillars of red rock. Build speed, boost, jump and reach the golden star.
- **Tiziri**: a starry night over the dunes. Fly through twelve gates of light, along the sand or in mid-air; the dawn
  rises after the golden gate.
- **Free dunes**: no goal, just the carpet, the wind and the light.

The interface is available in French, English, Chinese, Russian and Amazigh (Standard Moroccan Tamazight, written in
Tifinagh). The language follows the browser and can be changed in the settings panel.

## Controls

| Key                  | Action                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `←` `→` / `A` `D`    | Steer                                                                                 |
| `↑` / `W`, `↓` / `S` | Push to build speed, brake                                                            |
| `Shift`              | Boost: recharges over time and steers the flight in the air                           |
| `Space`              | Jump: hold to charge, release to launch. Tap again in the air to flip (`↓`: backflip) |
| `C`                  | Crouch (faster downhill); dive while boosting in the air                              |
| `R`                  | Restart the level                                                                     |
| `N`                  | Next level, once the current one is finished                                          |
| `H`                  | Hide or show the interface                                                            |
| `M`                  | Sound on or off                                                                       |

On touch screens a joystick (left) and three buttons (right: jump, boost, crouch) replace the keyboard.

## Play and build

The game is a single self-contained HTML file. Building it needs Node.js (the build script itself runs on 18 or later;
the development tools below require 20.19+, 22.13+ or 24+):

```sh
npm install
npm run build        # writes dist/index.html
```

Open `dist/index.html` in a browser, or serve the `dist` folder with any static web server. three.js (r128) and the
Google Fonts are loaded from CDNs, so an internet connection is required; without the fonts the game falls back to system
fonts.

## Development

```sh
npm run check        # formatting, lint (sources and bundle), unit tests and a build
npm test             # unit tests only (node:test, no browser needed)
npm run test:e2e     # end-to-end tests in headless Chromium (see below)
npm run format       # apply Prettier
```

The end-to-end tests drive the built game through the `window.__sandwake` debug handle. They need a Chromium build for
Playwright (`npx playwright install chromium`) and a previous `npm run build`. WebGL runs in software (SwiftShader), so no
GPU is required, but the tests are slow.

### Project layout

```
src/
  sim.js           Analytic terrain, level data and the carpet physics. No dependencies; also loaded by the unit tests.
  shaders.js       GLSL sources (terrain, sky, rider, particles, gates) kept as template strings.
  avatar.js        The procedural rider and carpet: geometry, materials and animation.
  music.js         Generative music (pentatonic scales, drums, a night variant).
  i18n.js          Interface strings for every language and the language picker.
  game/            The game itself, split by concern (see the header of game/01-runtime.js).
  styles.css       Interface styles.
  template.html    Page skeleton with the interface markup.
assets/            The Tifinagh font subset, embedded in the build, and its licence.
scripts/           build.js (bundler) and lint-bundle.js (lints the concatenated bundle).
tests/unit/        Unit tests: physics, terrain, levels, translations, build.
tests/e2e/         Browser tests: every language and level, the autopilot run of Tiziri, the settings panel.
```

The sources are plain browser scripts rather than ES modules. `scripts/build.js` concatenates `sim.js`, `shaders.js`,
`avatar.js`, `music.js` and `i18n.js`, then wraps `src/game/*.js` (in file-name order) in one function scope, and inlines
the result, the stylesheet and the font into `template.html`. Files therefore share their top-level names, and the
numeric prefixes of `src/game` give the initialisation order.

### How it works

- **Terrain.** The dunes are a closed-form height field (a sum of phase-modulated waves) evaluated on the CPU in
  `sim.js` for the physics and on the GPU in the terrain shaders, so the two always agree and the world is unbounded.
  Levels add their own analytic geometry on top (the Jbel pillars, the taller Tiziri dunes).
- **Floating origin.** Positions are kept in double precision on the CPU; everything sent to the GPU is relative to an
  origin that is re-centred when the player drifts away, which avoids precision loss far from the start.
- **Physics.** A fixed 120 Hz step with sliding friction, ground suction, a charged jump, flips and a boost with a gauge.
- **Night.** Tiziri blends a night palette into the sky, sand, rider and effects through a single `uNight` uniform; the
  gates are drawn in one draw call from two uniform arrays.
- **Quality.** The resolution and the effects adapt automatically to the frame rate; the settings panel can pin a preset.

### Adding a language

1. Add a block to `I18N` in `src/i18n.js` with exactly the keys of the English one (`npm test` checks this) and list the
   code in `LANGS`.
2. Add a button with `data-l="<code>"` to both `.langs` groups in `src/template.html`.
3. If the script needs a particular font, add an `html[lang="<code>"]` rule in `src/styles.css`.

## Credits

Made by Sacripant. Inspired by Amazigh art from the Souss. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the
fonts and libraries used.
