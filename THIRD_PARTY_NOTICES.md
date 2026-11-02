# Third-party notices

SandWake itself contains no third-party code except the font subset listed below. The libraries and fonts it loads at
runtime, and the tools used to develop it, are listed here with their licences.

## Embedded in the game

| Component                                                                                       | Use                                                      | Licence                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Noto Sans Tifinagh](https://github.com/notofonts/tifinagh) 2.006, subset (`assets/tfng.woff2`) | Tifinagh letters in the interface and the in-game glyphs | SIL Open Font License 1.1, see [`assets/NotoSansTifinagh-OFL.txt`](assets/NotoSansTifinagh-OFL.txt). Copyright 2022 The Noto Project Authors. |

The font is embedded in `dist/index.html` as a base64 data URI by `scripts/build.js`.

## Loaded at runtime from a CDN

| Component                                                                                                                                                                                                                                               | Use                  | Licence                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------- |
| [three.js](https://threejs.org/) r128, from cdnjs                                                                                                                                                                                                       | 3D rendering         | MIT                       |
| [Reem Kufi](https://fonts.google.com/specimen/Reem+Kufi), [Forum](https://fonts.google.com/specimen/Forum), [Jost](https://fonts.google.com/specimen/Jost) and [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC), from Google Fonts | Interface typography | SIL Open Font License 1.1 |

If the CDN is unreachable the game falls back to system fonts; three.js is required to play.

## Development tools

ESLint, Prettier and Playwright are used for linting, formatting and the end-to-end tests (see `package.json`). They are
not part of the built game. `three` is installed as a development dependency only so that the end-to-end tests can serve
it locally instead of reaching the CDN.
