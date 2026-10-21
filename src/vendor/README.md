# Vendored libraries

Everything the game runs is served from this folder: no CDN, no npm, no build step (PROJECT.md rule 3).
Each library keeps its own licence file here. To update one, fetch the version from npm, replace the
file(s) below and re-apply the local changes listed for it, then update the version here and in
[CREDITS.md](../../CREDITS.md).

| File | Library | Version | Source | Licence | Local changes |
|---|---|---|---|---|---|
| `three.module.min.js` | [three.js](https://threejs.org) | r169 (npm `three@0.169.0`) | `build/three.module.min.js` from [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT, `THREE-LICENSE.txt` | None: byte-identical to the npm build |
| `RoomEnvironment.js` | three.js add-on | r169 (npm `three@0.169.0`) | `examples/jsm/environments/RoomEnvironment.js` (three.js's port of Google model-viewer's `EnvironmentScene`, linked in its header) | MIT, `THREE-LICENSE.txt` | The import is `'./three.module.min.js'` instead of `'three'`; nothing else |
| `anime.mjs` | [anime.js](https://animejs.com) | 4.5.0 (npm `animejs@4.5.0`) | [juliangarnier/anime](https://github.com/juliangarnier/anime) | MIT, `ANIMEJS-LICENSE.md` | A minified ES-module bundle of only what the game imports. The library code is unchanged; rebuild with esbuild from an entry of `export { animate, createTimeline, splitText, spring, stagger, utils } from 'animejs';` and `esbuild entry.mjs --bundle --minify --format=esm` (licence comments are kept at the end) |
| `confetti.mjs` | [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.4 (npm `canvas-confetti@1.9.4`) | `dist/confetti.module.mjs` | ISC, `CONFETTI-LICENSE.txt` | None: byte-identical |
| `torph.mjs` | [Torph](https://torph.lochie.me) by Lochie Axon | 0.1.3 (npm `torph@0.1.3`) | `dist/index.mjs` from [lochie/torph](https://github.com/lochie/torph) | MIT, `TORPH-LICENSE.txt` | None: byte-identical |
| `web-haptics.mjs` | [web-haptics](https://haptics.lochie.me) by Lochie Axon | 0.0.6 (npm `web-haptics@0.0.6`) | `dist/chunk-4NSAIXAB.mjs` from [lochie/web-haptics](https://github.com/lochie/web-haptics) | MIT, `WEB-HAPTICS-LICENSE.txt` | One file instead of two: the published chunk with a header comment, without its `"use client"` line, and exporting `WebHaptics` and `defaultPatterns` by name (what the package's `dist/index.mjs` re-exports) |
| `cuelume/` | cuelume by Daniel Belyi | 0.2.4 (npm `cuelume@0.2.4`) | `dist/` from [danielwh2/cuelume](https://github.com/danielwh2/cuelume), without the `.d.ts` files | MIT, `CUELUME-LICENSE.txt` | `audio/engine.js` gains `useAudio(context, destination)`, so cues play on the game's own `AudioContext` and into its UI bus (volume, mute and the iOS unlock apply), and its output connects to that destination; `index.js` gains a header line and re-exports `useAudio`. Search for "Salon Noir" in those two files |

## Ported, not vendored

These are re-written in plain JavaScript and CSS inside the game, so there is no library file to update.

| What | From | Where | Licence |
|---|---|---|---|
| Shimmer Button, Animated Circular Progress Bar | [Magic UI](https://magicui.design) | `src/ui-kit.mjs`, `src/app.css` | MIT, `MAGICUI-LICENSE.md` |
| Push Button, Hold to Confirm, Switch Spring, Toast Overshoot, Badge Counter, Accordion Spring, Error Shake (timings and curves) | Kinetics ([kinetics.colorion.co](https://kinetics.colorion.co), by ckissi) | `src/ui-kit.mjs`, `src/app.css` | No licence file published; credited in CREDITS.md |
