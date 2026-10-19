# Salon Noir: project brief for AI assistants

Read this first. It explains what the game is, how it's built and what to keep intact.

## What it is

Salon Noir is a private browser casino: first-person 3D blackjack and European roulette. It's made for the owner and friends to play at home. **Play chips only, no real money, not a public product.**

Tables (see `src/core/lobby.mjs`):

| Game | Table | Status |
|---|---|---|
| Blackjack | Classic (6 side bets, pays 3:2) | Live |
| Blackjack | Free Bet (free doubles/splits, dealer 22 pushes) | Live |
| Blackjack | Lightning (multipliers up to 25×) | Live |
| Roulette | European (single zero, racetrack, call bets) | Live |
| Roulette | Lightning / Mega Lightning | **Not built yet**, shown as "Opening soon" |

History: the code folder was called `v28` (its 28th version) until it was renamed `src`. The project began as "Velvet Blackjack", was renamed "Spader", and is now "Salon Noir". Old names still show up in comments and in a localStorage key (`spader.balance`), on purpose.

## How to run it

Plain HTML + ES modules, **no build step, no npm, no framework**. Browsers block ES modules over `file://`, so serve the folder:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

`index.html` is the entry point. It loads `src/fonts.css`, `src/app.css` and `src/game.mjs`.

## Tech

- **3D:** three.js (vendored in `src/vendor/three.module.min.js`), custom scenes in centimetres
- **Audio:** Web Audio API, four buses (table, dealer voice, room, music) in `src/sound.mjs`
- **Motion/UI:** anime.js, Torph, canvas-confetti, web-haptics, cuelume, all vendored in `src/vendor/`
- **State:** one shared chip balance in localStorage (`src/core/wallet.mjs`, key `salonnoir.balance`, starts at 1,000)
- **Targets:** desktop browsers and iPhone Safari. Phone performance matters (graphics presets, battery saver, reduced motion).

## File map

```
index.html                 Page shell: top bar, stage canvas, dock (bets/decisions), settings sheet, lobby
README.md, CREDITS.md      Front page and full credits
docs/screenshots/          Screenshots used by the README
src/                       All code, styles, fonts, sounds and libraries
  game.mjs                 Main controller: wires engine ↔ table view ↔ controls; also launches roulette
  engine.mjs               Blackjack rules engine (8 decks, S17, hole card, 3:2, ten-card Charlie). No DOM.
  sidebets.mjs             Side-bet evaluation and paytables. No DOM.
  players.mjs              AI players at the table (bankrolls, styles, basic strategy). No DOM.
  sound.mjs                All audio
  ui-kit.mjs, ui-motion.mjs  Buttons, toasts, springs, morphing numbers
  app.css, fonts.css       All styling; fonts self-hosted in src/fonts/
  core/
    brand.mjs              Name, spade/keyhole logo SVG, wordmark
    lobby.mjs              Front-room lobby and table picker
    modes.mjs              Blackjack table variants (Classic, Free Bet, Lightning) and their rules text
    wallet.mjs             Shared balance
    feel.mjs               Haptics, synthesised UI cues, confetti
  scene/
    world.mjs              Blackjack 3D table and seated camera
    view.mjs               Dealer choreography: how cards and chips move
    pieces.mjs             Card and chip objects plus a small motion engine
    textures.mjs           Canvas-drawn card faces, felt layout, chips
    lightning3d.mjs        Lightning-table bolts, felt burns, sparks
  roulette/
    rgame.mjs              Roulette controller (betting, spin, payout)
    rules.mjs              European roulette rules, bets, payouts. No DOM.
    physics.mjs            Ball/wheel simulation (seeded, after Small & Tse 2012)
    rscene.mjs             Roulette 3D table and layout
    wheel3d.mjs            3D wheel model
    roller.mjs             Synthesised ball-rolling sound
  sounds/                  Card/chip WAVs (Kenney, CC0); sounds/kit/ = music, stings, UI, dealer voices
  vendor/                  Third-party libraries with their licences
assets/
  cards/                   Court-card art (two styles; court-belt/ is the alternate set)
  table/                   Felt, leather, card back, room backdrop
  roulette/                Wood veneers and the tall salon picture
```

## Architecture rules (keep these)

1. **Rules engines have no DOM.** `engine.mjs`, `sidebets.mjs`, `players.mjs` and `roulette/rules.mjs` are pure logic. The scene only reads state; the controller tells the view what happened.
2. **One wallet** for every game. Never give a game its own balance.
3. **Everything is self-hosted.** No CDNs, no external requests. New libraries go in `src/vendor/` with their licence file.
4. **Units are centimetres** in every 3D scene.
5. **Credit new assets** in three places: the Credits section of `index.html` (shown in the game), `CREDITS.md`, and `src/sounds/CREDITS.txt` for sounds.

## Look and feel (don't drift from this)

- Dark, private, upscale salon: near-black (`#0c0c0d`), brass/gold accents (`#c9a45c`, `#e2c483`), ivory, a little red
- Type: **Bodoni Moda** (wordmark, display), **Cinzel** (felt lettering), **Inter** (UI and numbers), **Barlow Condensed** (card indices, chip values)
- Logo: a brass spade with a lit keyhole (`src/core/brand.mjs`)
- Feels physical: real dealer pace, chip sounds placed left/right, haptics on phone, confetti only for big moments

## Assets you can't see

Most AI models can't view the images and audio directly:

- **Cards:** jumbo-index faces are drawn in code (`textures.mjs`); the WebP files are court-card (J/Q/K) art plus ace of spades variants
- **Dealer voices:** James and Sofia (made with ElevenLabs), e.g. `james-n17.mp3` = calls "17" at roulette, `sofia-bj-dealer-busts.mp3` = blackjack call
- **Music:** `music-lobby.mp3`, `music-bossa.mp3` (Kevin MacLeod, CC BY 4.0), `music-roulette.mp3`
- **Lightning:** `thunder-*`, `spark-*`, `zap-*`, `strike.mp3`, `charge.mp3`

## Next up

- Lightning Roulette (and Mega Lightning) table, the "Opening soon" card in the lobby
- Owner adds more items here as they come up
