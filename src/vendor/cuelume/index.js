// cuelume 0.2.4 (MIT, see ../CUELUME-LICENSE.txt). Salon Noir change: audio/engine.js gains useAudio(context, destination).
/**
 * Cuelume — curated interaction sounds synthesized via the Web Audio API.
 * No audio files, no dependencies, one shared `AudioContext`.
 *
 * Declarative:
 *   import { bind } from "cuelume";
 *   bind(); // wires up all data-cuelume-* attributes
 *
 * Imperative:
 *   import { play } from "cuelume";
 *   play("success");
 *   play("success", { emphasis: "strong" }); // weightier when it matters
 */
export { themes } from "./sounds/themes.js";
export { sounds } from "./sounds/recipes.js";
export { play, setEnabled, setTheme, setVolume, useAudio } from "./audio/engine.js";
export { bind } from "./interactions/bind.js";
