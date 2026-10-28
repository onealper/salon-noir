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
| Roulette | Lightning (1 to 5 numbers struck at 50× to 500×) | Live |
| Roulette | Mega Lightning (chain lightning, a double strike to 2,000×) | Live |

House rules worth knowing (all in the rules cards in Settings, and checked by the tests):

- **Classic** (the base of all three): 8 decks, dealer stands on soft 17, hole card with a peek, blackjack pays 3:2, one split (aces take one card), double after split, insurance 2:1 and **even money** offered on your blackjack against an ace, ten-card Charlie. Lucky Lucky pays **30:1 on an unsuited 6-7-8**.
- **Free Bet:** free doubles on hard 9-11 and free splits on every pair but tens, **resplitting up to four hands**; tens split for your own stake; a dealer 22 pushes, and Push 22 takes the Dealer Pairs spot (11:1).
- **Lightning:** a fee equal to the main bet; multipliers struck onto the final totals pay on your next win. Its return figures (engine.mjs, modes.mjs) are the owner's call: leave them as they are. The board is struck as a show (`strikeBoard` in `blackjack/lightning-ui.mjs`): the room goes dark and the air charges (a hum made in `sound.mjs`, `buzz`; static over the brass lip, the shoe and the chip rack; the cells crackling), the strikes come quicker and quicker, smallest first, and once the last one's light has died the biggest waits a held breath in a deeper dark before it lands with the full peal. Each bolt restrikes its own way (one to three times; the lamp, the mirrors and the screen's flash follow it stroke for stroke) and leaves a faint afterimage. Soft keeps every strike to one swell, 360 ms apart; Reduce motion runs it at once. Outside the salon a storm (`blackjack/storm.mjs`) comes as near as the multiplier riding on your bet: rain on the windows, flashes through them (the mirrors and window glass light up through the wall's light mask, the panes fall across the felt, a near one browns the lamps out) and thunder after them, later and more muffled the farther it is. It holds off while the board is struck and comes overhead when a multiplier pays. It only reads the table. A multiplier paying is the biggest moment (`payoff`): its light gathers on your badge, a gold bolt drives into it and the picture holds for a breath (the hit-stop: `hold` in `scene/stage.mjs` skips frames), then the shake, the thunder and the haptics come as big as the multiplier, the dealer calls "Lightning strikes!", the multiplier slams onto the screen and the bonus counts up under it with rising ticks (`blip` in `sound.mjs`) while it is paid onto your stack in crackling chips; the balance takes it as the count lands. Flashing effects tames its flash too; Reduce motion skips the gathering and the hold.
- **European roulette:** single zero with **la partage** (half of each even-money bet back on zero), the racetrack with neighbours and the call bets (printed on the cloth in a landscape view, where a tap on it bets as the sheet does, and the croupier places the chips of a call bet; on an upright phone the Racetrack sheet is the track), limits per kind of bet (posted on a brass plaque at the far corner of the cloth, from the rules' own figures). The other players sit around the table's edges, each with colour chips of their own (a marker by the wheel shows what one is worth: 5, 10 or 25, chosen each visit). Every player's chips on a spot make one column; the croupier rakes the losing chips toward him with a real rake (a heap at the corner under Reduce motion), wins are cut in stacks of 20 and cuts of 5 (yours in value chips), la partage halves the stake where it stands, and each player's chips are pushed to their own seat. Your straight-up win takes the camera low over the cloth to watch it cut, and a slow-motion replay rides behind the ball (Settings: Replays, your straight-up wins, every spin, or off). The wheel is a live-studio wheel (`roulette/wheel3d.mjs`): piano-black bowl, a polished black stone track under a gold ring light, chrome canoes, deep pockets parted by solid chrome frets, a sunburst cone and a chrome French-cross turret; its depth is painted occlusion, so neither it nor the ball casts a shadow map (the ball has a contact shadow). You stand at the long side, eyes about a metre over the cloth, looking down at about 50° through a natural lens, the whole wheel at your left (`computeShots` in `rscene.mjs`); one cloth covers the top inside a rim of Macassar wood, cut round the wheel (a brass ring between) and the chip tray, the printed layout lying on it; a padded leather armrest runs along the players' side and round the foot, rounded at both ends (the croupier's side is his); the table stands on a lacquered apron with lines of warm light, a pedestal and a plinth glowing on the carpet, and a low results marquee stands behind the wheel beside the chip tray.  Between spins the wheelhead coasts to a stop and stands. The croupier spins with the bets still open: from your seat you see him stop the wheelhead, spin it the other way and launch the ball, and you (and the others) can add chips, not take any back, until he calls "No more bets" about two laps before the drop. Bets close and settle the moment he calls it, the number drawn then (a page closed before the call has staked nothing), and the camera glides down to the wheel (to the pocket at the drop, back to your seat for the payout: no cut to black). The spin's ending is one of the ways it was tried ahead, a try a frame while the ball ran (`plan`, `warm` and `aim` in `physics.mjs`): the ball's last rounds a few per cent quicker or slower, and the scatter of canoes and frets from the drop. Most rest in the drawn number's pocket as they are; the rest are a pocket off, made up by the wheelhead running a few per cent quicker or slower between the call and the ball landing on it, a smooth swell that starts and ends at its own speed. The run before the call doesn't depend on the number, and nothing is ever pushed. From the call the numbers your bets cover are lit on the wheel, the room's light dims toward the wheel and the music stays down through the rattle; the ring light flashes the number's colour as it is called (Flashing effects: Soft keeps it gentle, Off removes it). From the call the ball's flight only shows the result, and the screen gives nothing away early: once the ball is at rest James says "The winning number is…" and the number, its bubble showing as he starts to say it, and the balance and "This visit" hold until the winnings land on the cloth. The dolly stands on the number's column and comes up as the chips go home, before "Place your bets"; the number keeps a soft glow until your next chip.
- **Lightning and Mega Lightning roulette** (rules and odds: `roulette/lightning.mjs`; the show: `roulette/rlightning.mjs`, its own bolts and sounds, `lr-*`): the same room in a black-and-gold studio (`DRESS` and `setStudio` in `rscene.mjs`), chosen in the lobby (`setKind` in `rgame.mjs`, kept as `spader.rouletteTable`). Lightning strikes 1 to 5 numbers at 50× to 500×, and a straight up on a struck number is paid its multiplier to 1; any other straight up pays 29:1 (Mega: 19:1, chain lightning on to as many as 10 numbers, and a double strike lifting one to 600×-2,000×). No la partage; every other bet pays as at the European table. A straight up returns about 97.1% (the tables in `lightning.mjs` are ours, set to the return the studios publish, and the tests hold it), every other bet 97.3%. The croupier calls "No more bets" three and a half laps out (`lead` in `plan`), and the lightning is drawn with the number and settled with it; then, while the ball makes its last rounds, the studio darkens round the layout, static runs over the number grid as the air charges, and the numbers are struck one after another, quicker and quicker. Each strike is drawn as lightning behaves: a dim stepped leader jerking down out of the dark above the picture, then the return stroke many times brighter, restriking along the same channel (one to three times) and leaving a violet afterimage, the crack of its sound landing with it; where it grounds the screen flashes at the point, the picture holds for a breath (`hold`), the view shakes, a shockwave runs over the cloth, a branching burn cools from blue-white to ember, sparks fly and fall back, and smoke rises. The multiplier is forged on its square as a plaque that lands white-hot, rolls through the ladder like a reel to its figure and cools to gold, live current crawling round its edge; the board by the wheel fills, and the struck pockets turn gold on the wheel's number ring (`strike` in `wheel3d.mjs`). Mega's chain lightning leaps low across the cloth from number to number in red-orange, and its double strike comes last, after a held breath in a deeper dark, the biggest bolt there is. A struck straight up of yours paying: "Lightning strikes!", a gold bolt into its plaque, the multiplier slammed onto the screen, then the payout. As the chips go home the round is over, and the plaques' charge dies away (they cool to ember and are gone, on the wheel and the board too). Flashing effects: Soft keeps each strike to one swell with a faint flash and no shake; Off and Reduce motion stamp the numbers with no bolts.
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

### Testing aids

| Aid | What it does |
|---|---|
| `node --test` | The suite above |
| `?test`, or `localStorage['salonnoir.dev'] = '1'` | A testing session: the aids below answer only here, so nobody at a friend's table can read the shoe or fix a number from the console |
| `?seed=N` | A reproducible shoe (testing session only) |
| `window.__spader` | The salon's hooks: `settings`, `audio`, `feel`, `load(room)`, `setRoom(room)`, the rooms as `blackjack` and `roulette`, and the blackjack table's `table`, `view`, `world`, `motion`, `seating`, `lightning`, `mode`, `busy`, `choose(action)`, `rig([...cards])` (empty until that room is built) |
| `__spader.roulette.test` | `rig(n)` fixes the next number, `rigStrikes([...])` the next lightning, `turbo` hurries the ball, `place(spot, units)`, `history`, `plan`, `at`, `bolts` (the strikes) |
| `?table` | Skips the lobby and sits you at the last room's table (any session) |
| `?nosw` | Runs without the service worker and removes it from that browser |

## Tech

- **3D:** three.js (vendored in `src/vendor/three.module.min.js`), custom scenes in centimetres
- **Audio:** Web Audio API, five buses (table, dealer voice, room, music, ui) in `src/sound.mjs`
- **Motion/UI:** anime.js, Torph, canvas-confetti, web-haptics, cuelume, all vendored in `src/vendor/`
- **State:** one shared chip balance in localStorage (`src/core/wallet.mjs`, key `salonnoir.balance`, starts at 1,000); every key is listed under Storage below
- **Targets:** desktop browsers and iPhone Safari. Phone performance matters (graphics presets, battery saver, reduced motion).
- **Anti-aliasing** (see `glOptions` and `QUALITY` in `scene/stage.mjs`): 4x multisampling on Sharp and Balanced (phones' tiled GPUs keep the samples on chip, so it costs them little and steadies the fine edges of the turning wheel); only the battery saver goes without on a high-density screen. Sharp keeps a desktop at its own 2x up to 7 MP; Balanced draws a phone up to 3x within 2.4 MP. Fine chrome is given real widths and some roughness so its glints don't sparkle. Textures get mipmaps and the GPU's full anisotropic filtering.
- **Frame cost:** each room draws only when something changes, at 60 frames a second on every screen (`due` in `scene/stage.mjs`: a 120 Hz screen is drawn for on every other refresh, a 90 or 144 Hz one on the refreshes nearest each sixtieth); everything that moves, the lobby's orbit and the lightning's crackle included, runs at that 60. The GPU is the browser's default (`glOptions`: asking for high performance would wake a MacBook's discrete GPU). Between spins the roulette wheelhead coasts down from the spin to a stop over some seconds and then stands, so nothing is drawn while you bet (a wheel drifting between spins kept a MacBook Air's GPU at 90%: `idle` in `rgame.mjs`). The lobby's orbit glides to rest after 20 seconds without a touch, click, key or scroll, or with the window out of focus, and picks up at the next touch (`orbitPace` and `quietFor` in `scene/stage.mjs`); at rest nothing is drawn, and its ticker leaves the loop until the next touch. **No animation runs forever**: a decoration plays a few times as it appears and rests (the lobby's gilt and keylight, the Deal and Spin shimmer, the Lightning badge's hum), and the splash is removed once it has faded; an endless one had the page composited every frame for as long as it was open (in Firefox, and Zen, an SVG's animation repaints on the main thread). So at rest, in the lobby or at either table, the page draws nothing at all. Nothing the coasting wheel moves casts a shadow, so its frames redraw no shadow map; only the layout's pendant casts shadows (chips, the rake, the bowl on the wood), redrawn when those move. The frame-time watcher steps the pixels down after a stretch of frames slower than about 40 a second (a GPU stuck at 30 is not taken for a 30 Hz screen).

## File map

```
index.html                 Page shell: top bar, stage canvas, dock (bets/decisions), settings sheet, lobby
README.md, CREDITS.md      Front page and full credits
LICENSE                    All rights reserved for the owner's own work; third-party material keeps its licence
sw.js, manifest.webmanifest, icons/   Offline play and the home-screen app (icons rendered from the brand mark)
.nojekyll                  Empty: GitHub Pages serves the files as they are (README, "Play on your phone over HTTPS")
docs/                      The README's logo (logo.svg, from brand.mjs), screenshots and Lightning clip (screenshots/)
test/                      node --test suite over the pure modules (helpers.mjs: cards, seeded random, storage stand-in)
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
    lightning-ui.mjs       The Lightning table's board, strikes, badge, the payoff and flashes
    storm.mjs              The storm outside at the Lightning table: rain, window flashes, thunder by distance. Reads the table only
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
                           lost-context handling, leather and brass, the lobby's light sweep from table to table (swap)
    glass.mjs              Clear acrylic: a reflection probe of the real table, one shader for faces (Fresnel at both
                           surfaces, Beer-Lambert) and cut edges (the probe refracted, dispersed; piped light), polished
                           sheets, and what glass does to the cloth (shade, caustics)
    world.mjs              Blackjack 3D table and seated camera; what holds the table up (tableBase: a lacquered apron with
                           lines of warm light, a pedestal, a brass-edged plinth lighting the carpet); the clear acrylic shoe (after real 8-deck shoes: a lidded
                           trough climbing to its back on a frosted floor, the weight (a wedge on steel rollers, with a knob) behind the cards, a
                           frosted chin, and in the tongue the card reader: a slot window with a red light guide that brightens
                           as each card goes over it), and the matching discard holder
    view.mjs               Dealer choreography: how cards and chips move
    pieces.mjs             Card and chip objects (a card bends as paper does: bendCard) plus a small motion engine
    textures.mjs           Canvas-drawn card faces, felt layout, chips
    lightning3d.mjs        Lightning-table bolts and their afterimages, felt burns, sparks, the static before a strike
    portal.mjs             The lobby's portal between the rooms: the ring in the floor, the table drawn down; the ring above, the table dropped
  roulette/
    rgame.mjs              The roulette room, createRoulette(ctx): its three tables (TABLES, setKind), betting, spin, payout
    rules.mjs              European roulette rules, bets, payouts (a Lightning table's prices: setRules). No DOM.
    lightning.mjs          Lightning and Mega Lightning: how many numbers are struck, their multipliers, the exact return. No DOM.
    rlightning.mjs         The Lightning tables' own lightning: the charge, stepped leaders and return strokes, the cloth's
                           burns, sparks and smoke, the forged plaques, chain lightning, the double strike, the payoff's bolt
    physics.mjs            Ball/wheel simulation (seeded, after Small & Tse 2012)
    replay.mjs             The slow-motion replay's camera, fitted to the screen from the planned path. No DOM.
    rscene.mjs             Roulette 3D table, its lit lower body, the painted layout, lights, the seat and spin shots
    wheel3d.mjs            The live-studio wheel: black lacquer bowl, stone track, chrome canoes and frets, French-cross turret;
                           the numbers your bets cover lit (mark) and the struck ones in gold (strike)
    roller.mjs             Synthesised ball-rolling sound
  sounds/                  Card/chip WAVs (Kenney, CC0); sounds/kit/ = music, stings, UI, dealer voices
  vendor/                  Third-party libraries with their licences; README.md lists versions and local changes
assets/
  cards/                   Court-card art: court-belt/ is the set in play; the top-level J/Q/K files (Howard Yeh, MIT) are the fallback
  table/                   Felt, leather, card back, the card salon panorama (and salon-light.webp, its mirrors, lamps and windows as R, G, B) and the carpet both rooms stand on
  roulette/                The table's Macassar veneer (laid book-matched), cloth nap and armrest leather, the wheel's stone track (stone.webp), the roulette salon panorama and the Lightning studio's set (studio.webp) (each room's panorama is wrapped round its table, out of focus: salonWall in scene/stage.mjs)
```

## Architecture rules (keep these)

1. **Rules engines have no DOM.** `engine.mjs`, `sidebets.mjs`, `players.mjs`, `roulette/rules.mjs`, `roulette/lightning.mjs` and `roulette/physics.mjs` are pure logic, as are the helpers they share (`core/chips`, `format`, `rng`, `modes`, `blackjack/book`). The scene only reads state; the controller tells the view what happened.
2. **One wallet** for every game. Never give a game its own balance.
3. **Everything is self-hosted.** No CDNs, no external requests. New libraries go in `src/vendor/` with their licence file.
4. **Units are centimetres** in every 3D scene.
5. **Credit new assets** in three places: the Credits section of `index.html` (shown in the game), `CREDITS.md`, and `src/sounds/CREDITS.txt` for sounds.
6. **Rooms share one lifecycle.** `createBlackjack(ctx)` and `createRoulette(ctx)` take the same `ctx` from `app.mjs` and return the same interface (`show`/`hide`, `toLobby`, `enter`, `onKey`, `hint`, `busy` and `round`, `setReduced`/`setFast`/`setQuality`, `refresh`, `players`, `callBets`). The salon owns settings, the sheet, the lobby and the keyboard. A variant of a game is a table of its room (blackjack's modes, roulette's `TABLES`: the lobby's card maps to it in `app.mjs`); a new game is a new room, built from `core/bet-controls.mjs` and `scene/stage.mjs`.
7. **Money moves through the save.** At blackjack every Table method that changes a hand is wrapped so `save()` writes the wallet and the in-flight record in one go (`blackjack/controller.mjs`): add any new state-changing method to that list and keep the Table's state plain JSON. Roulette pays as bets close. Never write the wallet around them.

## Storage

Everything lives in the browser that plays; nothing leaves it.

| Where | Key | What |
|---|---|---|
| localStorage | `salonnoir.balance` | The chip balance (read from the old `spader.balance` if it is missing) |
| localStorage | `salonnoir.inflight` | The round in play (a blackjack hand, less the order of the shoe and the hole card; a spin), by page; `salonnoir.pulse` and `salonnoir.claim` let a second window tell a live page from a closed one where there are no Web Locks |
| localStorage | `salonnoir.ledger` | Last hands: the last 30 rounds at every table |
| localStorage | `salonnoir.dev` | `'1'` makes this browser a testing session |
| localStorage | `spader.*` | Settings and table memory, as JSON: `chip`, `dealer`, `fast`, `flash`, `flashNoted`, `gfx`, `haptics`, `lightningPending`, `mix`, `mode`, `neighbours`, `players`, `reduced`, `replays`, `room`, `rouletteDir`, `rouletteHistory`, `rouletteTable`, `sides`, `sound`, `tray`, `volume` |
| sessionStorage | `salonnoir.visit` | This visit's net (the "This visit" readout) |
| sessionStorage | `salonnoir.lost` | Set for one reload when another window finished this page's hand |

**The dock** (both rooms): where it runs along the foot of the screen, the table goes on under it behind a progressive blur (`.dock-blur` in `app.css`), and each room frames its seat clear of the blur (`dockCover` and `BLUR_RISE` in `app.mjs`, the `bottom` of `frame` in `scene/world.mjs` and `roulette/rscene.mjs`). A phone on its side keeps its controls in a plain column, and the battery saver keeps a plain bar (`body[data-gfx]`). Firefox (and Zen) blurs every layer again whenever the table moves behind it, so there the band keeps its three strongest layers and the top bar's its two (`@supports (-moz-appearance: none)`). Over the blur the buttons are dark glass; a disabled Deal or Spin stays a dim gold outline.

**The lobby** (`core/lobby.mjs`; `showTable` and `crossRooms` in `app.mjs`): the table behind the menu is the room's own, the camera circling it. Picking another table of the same game sweeps it in: the frame as it stood is kept on a picture over the canvas, the room is re-dressed under it, and a band of light runs across the picture and takes it away (gold; electric, flickering, for a Lightning table; `swap` in `scene/stage.mjs`, the orbit standing still meanwhile). Picking the other game goes through the portal (`scene/portal.mjs`): a ring of gold light opens in the floor round the table, a vortex turning in it; the table hops as it feels the pull and is drawn down into it, turning with the swirl, and the ring snaps shut in a flash of its light. Under the flash the rooms change places (the one coming in was laid out unseen behind, `body[data-coming]`, and its materials built meanwhile); there the camera is down by the floor looking up as a ring opens in the dark above, the table drops out of it (cut off at the ring by a clipping plane on its materials), lands with a squash, a thud and a ring of dust, and the camera cranes up into the orbit, which goes on from where it stood. Picks wait their turn, and only the latest waiting counts. Taking a seat, the menu leaves piece by piece (the title's pieces lift and blur away, the cards sink one after another, the button last), and once the camera has landed the bar comes down, the dock rises and the frosted bands grow in from the screen's edges, the strongest layer first. With reduced motion a change of table is a short crossfade and the rooms simply change.

Settings worth knowing: **Flashing effects** (Full / Soft / Off; Soft by default when the device asks for reduced motion) tames the Lightning table, **Last hands** lists every round with its cards, side bets and net, and **Reduce motion**, **Fast play** and the graphics presets apply in both rooms.

## Look and feel (don't drift from this)

- Dark, private, upscale salon: near-black (`#0c0c0d`), brass/gold accents (`#c9a45c`, `#e2c483`), ivory, a little red
- Type: **Bodoni Moda** (wordmark, display), **Cinzel** (felt lettering), **Inter** (UI and numbers), **Barlow Condensed** (card indices, chip values)
- Logo: a brass spade with a lit keyhole (`src/core/brand.mjs`)
- Feels physical: real dealer pace, chip sounds placed left/right, haptics on phone, confetti only for big moments

## Assets you can't see

Most AI models can't view the images and audio directly:

- **Cards:** jumbo-index faces are drawn in code (`textures.mjs`); the WebP files are court-card (J/Q/K) art plus the ace of spades (`ace_of_spades_2.webp`). The set in play is `assets/cards/court-belt/`; the top-level J/Q/K files are only the fallback if it fails to load
- **Dealer voices:** James and Sofia (made with ElevenLabs: the library voices "Jerry B. - British RP" and "Claire - British Classy Mature", Eleven v4), e.g. `james-n17.mp3` = "Seventeen, black." at roulette, `james-last-bets.mp3` = "Last bets, please." before the call, `sofia-bj-even-money.mp3` = the offer on your blackjack against an ace, `james-bj-lightning.mp3` = "Lightning strikes!" as a multiplier pays. Marco deals with James's voice and Elena with Sofia's. A new line must be made in the same voice (the exact wording of every line is in `src/sounds/CREDITS.txt`)
- **Music:** `music-lobby.mp3`, `music-bossa.mp3` (Kevin MacLeod, CC BY 4.0) and `music-roulette.mp3` (made with ElevenLabs Music: late-night lounge jazz); every sound's source is in `src/sounds/CREDITS.txt`
- **Lightning:** `thunder-*`, `spark-*`, `zap-*`, `strike.mp3`, `charge.mp3`, and the storm's `rain-window.mp3` (a seamless loop), at blackjack; Lightning roulette has its own, `lr-*` (ElevenLabs Sound Effects: the charge, three strikes, chain, double, fizzle, payoff)
- **The portal** (ElevenLabs Sound Effects v2): `portal-open`, `portal-drop` (the table drawn down), `portal-land` (its thud lands 12 ms in)
- **The roulette croupier** (ElevenLabs Sound Effects v3): `wheelhead-*` (his palm on the wheelhead, then the push: `PUSH` in `rgame.mjs` says where), `ball-launch-*`, `rake-*` (one per stroke), `dolly-*`

## Next up

- Owner adds more items here as they come up
