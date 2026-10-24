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

House rules worth knowing (all in the rules cards in Settings, and checked by the tests):

- **Classic** (the base of all three): 8 decks, dealer stands on soft 17, hole card with a peek, blackjack pays 3:2, one split (aces take one card), double after split, insurance 2:1 and **even money** offered on your blackjack against an ace, ten-card Charlie. Lucky Lucky pays **30:1 on an unsuited 6-7-8**.
- **Free Bet:** free doubles on hard 9-11 and free splits on every pair but tens, **resplitting up to four hands**; tens split for your own stake; a dealer 22 pushes, and Push 22 takes the Dealer Pairs spot (11:1).
- **Lightning:** a fee equal to the main bet; multipliers struck onto the final totals pay on your next win. Its return figures (engine.mjs, modes.mjs) are the owner's call: leave them as they are.
- **European roulette:** single zero with **la partage** (half of each even-money bet back on zero), the racetrack with neighbours and the call bets (printed on the cloth in a landscape view; on an upright phone the Racetrack sheet is the track), limits per kind of bet. Every player's chips on a spot make one column; wins are pushed to the players' edge of the cloth, in line with their bets. Bets settle the moment they close (the number is drawn then); the ball's flight only shows it, and the screen gives nothing away early: once the ball is at rest James says "The winning number is…" and the number, its bubble showing as he starts to say it, and the balance and "This visit" hold until the winnings land on the cloth. The dolly stands on the number's column and comes up as the chips go home, before "Place your bets"; the number keeps a soft glow until your next chip.
- **Nothing is lost by leaving.** Each blackjack hand is saved move by move; a hand a closed or reloaded page left unfinished is **played out on the next visit** (you stand, insurance declined) and paid, with a note over the lobby. The saved hand never holds the order of the shoe or the dealer's hole card (`record` in `engine.mjs`), so the play-out deals them from a fresh shuffle of the unseen cards. A second window can't pay it twice (see `inFlight` in `core/wallet.mjs`), and the balance isn't reset while another window has a hand riding.

History: the code folder was called `v28` (its 28th version) until it was renamed `src`. The project began as "Velvet Blackjack", was renamed "Spader", and is now "Salon Noir". Old names still show up in comments and in storage keys (every setting is kept under `spader.*`, and the balance falls back to an old `spader.balance`), on purpose.

## How to run it

Plain HTML + ES modules, **no build step, no npm, no framework**. Browsers block ES modules over `file://`, so serve the folder:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

`index.html` is the entry point. It loads `src/fonts.css`, `src/app.css` and one module, `src/app.mjs` (the salon), which loads each room the first time you go to it: a visit that is all roulette never builds the blackjack table.

On https and localhost a service worker (`sw.js`) keeps the game for offline play, and `manifest.webmanifest` makes it a home-screen app (README: "Play on your phone over HTTPS", on GitHub Pages). Code is fetched fresh on every load, but sounds, images and fonts are served from its cache. **If you replace a media file under the same name, bump `VERSION` in `sw.js`**; when you add a file or a module, add it to the lists there too (a test checks the modules). `?nosw` runs without it.

## Tests

```
node --test                     # from the repo root, Node 22+; about 6 s, no install
```

`test/*.test.mjs` import the pure modules straight from `src/` (rules engines, side bets, players, roulette rules and physics, wallet, ledger) and check every payout, the paytables' house edges, money conservation, playing out a saved hand, the ball landing in the drawn pocket, the slow-motion replay keeping the ball in the picture on every screen shape, the roulette table's look (the other players' chip colours kept clear of the value chips and the brass, true-size chips, statistics that count the zero), and the architecture rules below. Run it after touching any rules or money code. On Node 22 don't pass a directory (`node --test test/` fails); with no argument it finds `test/**`.

On Node 24, run `node --no-experimental-global-navigator --test`: the wallet tests simulate browsers without Web Locks, and Node 24's global `navigator.locks` otherwise bypasses that simulation. The chip tests also check exact physical payout values (including half-chip returns), twenty-chip columns, the shared toss, and instance updates/removal.

Optional real-browser checks are in `tools/check-blackjack.cjs`, `tools/check-roulette.cjs`, and `tools/check-audio.cjs`. They need Playwright and Chromium as development tools, separate from the application; neither is loaded by the game. Start the HTTP server, then run a tool with `SALON_BASE_URL=http://127.0.0.1:8000 node tools/check-roulette.cjs` (substitute the other filenames as needed). `SALON_CHROMIUM` can select a browser executable. The audio check defaults to real rendering, normal play, and sound on. Its explicitly selected `SALON_QA_AUDIO_ONLY=1` mode checks only the audio graph and controls. Chromium phone viewports do not substitute for an actual iPhone/Safari check.

### Testing aids

| Aid | What it does |
|---|---|
| `node --test` | The suite above |
| `?test`, or `localStorage['salonnoir.dev'] = '1'` | A testing session: the aids below answer only here, so nobody at a friend's table can read the shoe or fix a number from the console |
| `?seed=N` | A reproducible shoe (testing session only) |
| `window.__spader` | The salon's hooks: `settings`, `audio`, `feel`, `load(room)`, `setRoom(room)`, the rooms as `blackjack` and `roulette`, and the blackjack table's `table`, `view`, `world`, `motion`, `seating`, `lightning`, `mode`, `busy`, `choose(action)`, `rig([...cards])` (empty until that room is built) |
| `__spader.roulette.test` | `rig(n)` fixes the next number, `turbo` hurries the ball, `place(spot, units)`, `history`, `plan`, `at` |
| `?table` | Skips the lobby and sits you at the last room's table (any session) |
| `?nosw` | Runs without the service worker and removes it from that browser |

## Tech

- **3D:** three.js (vendored in `src/vendor/three.module.min.js`), custom scenes in centimetres
- **Audio:** Web Audio API, five buses (table, dealer voice, room, music, ui) in `src/sound.mjs`
- **Motion/UI:** anime.js, Torph, canvas-confetti, web-haptics, cuelume, all vendored in `src/vendor/`
- **State:** one shared chip balance in localStorage (`src/core/wallet.mjs`, key `salonnoir.balance`, starts at 1,000); every key is listed under Storage below
- **Targets:** desktop browsers and iPhone Safari. Phone performance matters (graphics presets, battery saver, reduced motion).

Blackjack and roulette share the same chip toss and grouped payout motion. Resting chips are rendered in batches by denomination or player colour; moving chips temporarily become individual meshes. Winnings travel in full twenty-chip columns and remainder cuts of up to five, respecting denomination and destination-column boundaries. Every chip retains its full value, including half-chip change.

Roulette's AI players have independent session bankrolls, starting at 1,000 each, with counted reserves on their rail. A marker shows each colour's assigned unit; the name label counts reserve chips, and its accessible description also gives the bank, stake, and chips on the cloth. Chips debit the bank as they leave the reserve. Closed wagers settle once after physical collection; cancelling an unclosed wager refunds it. A player below their unit at a round boundary buys back to their original bank, with the added amount tracked separately from wins. Large banks exchange excess over a rack of 200 colour chips for ordinary value chips; the total value is never truncated. These banks do not read or write the user's wallet. Betting hints have their own line in the roulette dock, clear of the banks and value markers.

## File map

```
index.html                 Page shell: top bar, stage canvas, dock (bets/decisions), settings sheet, lobby
README.md, CREDITS.md      Front page and full credits
LICENSE                    All rights reserved for the owner's own work; third-party material keeps its licence
sw.js, manifest.webmanifest, icons/   Offline play and the home-screen app (icons rendered from the brand mark)
.nojekyll                  Empty: GitHub Pages serves the files as they are (README, "Play on your phone over HTTPS")
docs/screenshots/          Screenshots used by the README
test/                      node --test suite over the pure modules (helpers.mjs: cards, seeded random, storage stand-in)
tools/                     Optional Playwright checks for blackjack, roulette, and normal-play audio
src/                       All code, styles, fonts, sounds and libraries
  app.mjs                  The salon (start reading here): settings, sound, the settings sheet and Last hands, the top bar,
                           the lobby and moving between rooms, the one key handler; plays out a hand left unfinished
  engine.mjs               Blackjack rules engine (8 decks, S17, hole card, 3:2, ten-card Charlie, playOut). No DOM.
  sidebets.mjs             Side-bet evaluation and paytables. No DOM.
  players.mjs              AI players at the table (bankrolls, styles, basic strategy). No DOM.
  sound.mjs                All audio
  ui-kit.mjs, ui-motion.mjs  Buttons, toasts, springs, morphing numbers
  app.css, fonts.css       All styling; fonts self-hosted in src/fonts/
  blackjack/
    controller.mjs         The blackjack room, createBlackjack(ctx): wires engine ↔ table view ↔ controls, saves each move
    book.mjs               A hand's entry in Last hands, lost side-bet wording, the played-out notice. No DOM.
    lightning-ui.mjs       The Lightning table's board, strikes, badge and flashes
    tray-icons.mjs         The side-bet tray's line icons
  core/
    bet-controls.mjs       What both rooms' docks share: chip rack, hint line, Rebet/×2 slot, gold button, betting keys
    chips.mjs              Chip values and breakDown (one set of chips at every table). No DOM.
    format.mjs             fmt, signed, esc. No DOM.
    rng.mjs                mulberry32, the seeded generator (?seed and the wheel's simulated spins). No DOM.
    brand.mjs              Name, spade/keyhole logo SVG, wordmark
    lobby.mjs              Front-room lobby and table picker
    modes.mjs              Blackjack table variants (Classic, Free Bet, Lightning) and their rules text
    wallet.mjs             Shared balance, and inFlight: the round in play, saved so a closed page can't lose or repeat it
    ledger.mjs             Last hands (the last 30 rounds) and this visit's net
    feel.mjs               Haptics, synthesised UI cues, confetti
  scene/
    stage.mjs              What both 3D rooms share: renderer, render loop, frame-time watcher, quality presets,
                           lost-context handling, leather and brass
    world.mjs              Blackjack 3D table and seated camera
    view.mjs               Dealer choreography: how cards and chips move
    pieces.mjs             Card and chip objects plus a small motion engine
    chip-motion.mjs        Shared chip toss, grouped payouts, and batches of resting chips
    textures.mjs           Canvas-drawn card faces, felt layout, chips
    lightning3d.mjs        Lightning-table bolts, felt burns, sparks
  roulette/
    rgame.mjs              The roulette room, createRoulette(ctx): betting, spin, payout
    rules.mjs              European roulette rules, bets, payouts. No DOM.
    physics.mjs            Ball/wheel simulation (seeded, after Small & Tse 2012)
    replay.mjs             The slow-motion replay's camera, fitted to the screen from the planned path. No DOM.
    chip-stacks.mjs        Exact physical payout chips and twenty-chip column positions. No DOM.
    players.mjs            AI banks, counted inventory, wagers, refunds and once-only settlement. No DOM.
    reserve-layout.mjs     Counted reserve positions and bounds for each seat. No DOM.
    rscene.mjs             Roulette 3D table and layout
    wheel3d.mjs            3D wheel model
    roller.mjs             Synthesised ball-rolling sound
  sounds/                  Card/chip WAVs (Kenney, CC0); sounds/kit/ = music, stings, UI, dealer voices
  vendor/                  Third-party libraries with their licences; README.md lists versions and local changes
assets/
  cards/                   Court-card art: court-belt/ is the set in play; the top-level J/Q/K files (Howard Yeh, MIT) are the fallback
  table/                   Felt, leather, card back, room backdrop
  roulette/                Wood veneers and the tall salon picture
```

## Architecture rules (keep these)

1. **Rules engines have no DOM.** `engine.mjs`, `sidebets.mjs`, `players.mjs`, `roulette/rules.mjs` and `roulette/physics.mjs` are pure logic, as are the helpers they share (`core/chips`, `format`, `rng`, `modes`, `blackjack/book`). The scene only reads state; the controller tells the view what happened.
2. **One wallet** for every game. Never give a game its own balance.
3. **Everything is self-hosted.** No CDNs, no external requests. New libraries go in `src/vendor/` with their licence file.
4. **Units are centimetres** in every 3D scene.
5. **Credit new assets** in three places: the Credits section of `index.html` (shown in the game), `CREDITS.md`, and `src/sounds/CREDITS.txt` for sounds.
6. **Rooms share one lifecycle.** `createBlackjack(ctx)` and `createRoulette(ctx)` take the same `ctx` from `app.mjs` and return the same interface (`show`/`hide`, `toLobby`, `enter`, `onKey`, `hint`, `busy` and `round`, `setReduced`/`setFast`/`setQuality`, `refresh`, `players`, `callBets`). The salon owns settings, the sheet, the lobby and the keyboard; a new table (Lightning Roulette) is a new room, built from `core/bet-controls.mjs` and `scene/stage.mjs`.
7. **Money moves through the save.** At blackjack every Table method that changes a hand is wrapped so `save()` writes the wallet and the in-flight record in one go (`blackjack/controller.mjs`): add any new state-changing method to that list and keep the Table's state plain JSON. Roulette pays as bets close. Never write the wallet around them.

## Storage

Everything lives in the browser that plays; nothing leaves it.

| Where | Key | What |
|---|---|---|
| localStorage | `salonnoir.balance` | The chip balance (read from the old `spader.balance` if it is missing) |
| localStorage | `salonnoir.inflight` | The round in play (a blackjack hand, less the order of the shoe and the hole card; a spin), by page; `salonnoir.pulse` and `salonnoir.claim` let a second window tell a live page from a closed one where there are no Web Locks |
| localStorage | `salonnoir.ledger` | Last hands: the last 30 rounds at every table |
| localStorage | `salonnoir.dev` | `'1'` makes this browser a testing session |
| localStorage | `spader.*` | Settings and table memory, as JSON: `chip`, `dealer`, `fast`, `flash`, `flashNoted`, `gfx`, `haptics`, `lightningPending`, `mix`, `mode`, `neighbours`, `players`, `reduced`, `room`, `rouletteDir`, `rouletteHistory`, `sides`, `sound`, `tray`, `volume` |
| sessionStorage | `salonnoir.visit` | This visit's net (the "This visit" readout) |
| sessionStorage | `salonnoir.lost` | Set for one reload when another window finished this page's hand |

Settings worth knowing: **Flashing effects** (Full / Soft / Off; Soft by default when the device asks for reduced motion) tames the Lightning table, **Last hands** lists every round with its cards, side bets and net, and **Reduce motion**, **Fast play** and the graphics presets apply in both rooms.

## Look and feel (don't drift from this)

- Dark, private, upscale salon: near-black (`#0c0c0d`), brass/gold accents (`#c9a45c`, `#e2c483`), ivory, a little red
- Type: **Bodoni Moda** (wordmark, display), **Cinzel** (felt lettering), **Inter** (UI and numbers), **Barlow Condensed** (card indices, chip values)
- Logo: a brass spade with a lit keyhole (`src/core/brand.mjs`)
- Feels physical: real dealer pace, chip sounds placed left/right, haptics on phone, confetti only for big moments

## Assets you can't see

Most AI models can't view the images and audio directly:

- **Cards:** jumbo-index faces are drawn in code (`textures.mjs`); the WebP files are court-card (J/Q/K) art plus the ace of spades (`ace_of_spades_2.webp`). The set in play is `assets/cards/court-belt/`; the top-level J/Q/K files are only the fallback if it fails to load
- **Dealer voices:** James and Sofia (made with ElevenLabs), e.g. `james-n17.mp3` = calls "17" at roulette, `sofia-bj-dealer-busts.mp3` = blackjack call. Marco deals with James's voice and Elena with Sofia's
- **Music:** `music-lobby.mp3`, `music-bossa.mp3`, `music-roulette.mp3` (all Kevin MacLeod, CC BY 4.0; every sound's source is in `src/sounds/CREDITS.txt`)
- **Lightning:** `thunder-*`, `spark-*`, `zap-*`, `strike.mp3`, `charge.mp3`

## Next up

- Lightning Roulette (and Mega Lightning) table, the "Opening soon" card in the lobby
- Owner adds more items here as they come up
