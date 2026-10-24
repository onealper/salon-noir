# Roulette and chip continuation: validation

Checked on 2026-10-24 with Node 24.19.0, Python 3.12.14, and Chromium 154 on Linux using software WebGL.

## Automated rules and rendering helpers

`node --no-experimental-global-navigator --test` reports 92 passed, zero failed or skipped. Coverage includes target-pocket landings, playback continuity, replay framing, exact chip amounts and grouped cuts, instance cleanup, every roulette bet against all 37 results, 8,000 AI-bank conservation rounds, cancellation, once-only settlement, bank exchange, and audio bus muting.

## Browser checks

Serve the repository before running these optional tools. Playwright and Chromium are development tools; the application still has no package install or build step.

- `tools/check-blackjack.cjs`: seven checks passed, including normal/reduced motion, odd 3:2 payouts with half chips, splits, Free Bet markers, a large grouped payment, and a 27,000 Top 3 win. Collection leaves no chip instances behind.
- `tools/check-roulette.cjs`: bank debits, exact visible reserves, 35:1 AI settlement, la partage and half-chip change, pending-wager refunds, rapid bet replacement, and desktop/portrait/landscape framing passed. A focused shared-column cancellation check also passed, with no resurrected chips.
- `tools/check-audio.cjs`: real rendering and Web Audio passed with Sound on and Fast play, reduced motion, and test acceleration off. Checks cover nonzero roller/voice/card/chip output, ball rest before the winning call, number/history before payment, ledger updates after physical payment, suspend/resume, and muting already-active sources.

The final audio run used a 320×200 drawing buffer and disabled shadows to reduce software-rendering cost; it retained the real renderer, physics clock, and animations. Separate full-resolution checks cover the table and reserve layouts. Software WebGL is slower than a hardware browser, so these results do not establish device frame rate or battery consumption.

Use `SALON_BASE_URL` to select the running server and `SALON_CHROMIUM` to select a browser executable. `SALON_QA_GRAPHICS=saver` can reduce software WebGL cost. Each tool documents its other options and stores generated artifacts in a temporary directory. The audio tool's opt-in audio-only mode is separate from its default real-renderer check.

## Remaining device coverage

Actual iPhone/Safari, iOS audio interruptions, hardware GPU performance, and battery behavior have not been tested. Downloading the additional Playwright WebKit engine was blocked by the environment's network policy; Chromium viewport checks are not Safari/device evidence.
