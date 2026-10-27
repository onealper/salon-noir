# Credits

Salon Noir is built on other people's open work. Licence files sit next to the material they cover. The game's own code is all rights reserved; that does not change any licence below (see [LICENSE](LICENSE)).

Credits live in three places that must agree (PROJECT.md rule 5): this file, the Credits list in the game's settings (`index.html`), and [`src/sounds/CREDITS.txt`](src/sounds/CREDITS.txt), which lists every sound file.

## Code libraries (vendored in `src/vendor/`)

Versions, sources and local changes: [`src/vendor/README.md`](src/vendor/README.md).

| Library | Version | Use | Licence |
|---|---|---|---|
| [three.js](https://threejs.org) (with its `RoomEnvironment` add-on) | r169 | 3D rendering | MIT (`THREE-LICENSE.txt`) |
| [anime.js](https://animejs.com) by Julian Garnier | 4.5.0 | UI spring motion | MIT (`ANIMEJS-LICENSE.md`) |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) by Kiril Vatev | 1.9.4 | Win confetti | ISC (`CONFETTI-LICENSE.txt`) |
| [Torph](https://torph.lochie.me) by Lochie Axon | 0.1.3 | Morphing text and numbers | MIT (`TORPH-LICENSE.txt`) |
| [web-haptics](https://haptics.lochie.me) by Lochie Axon | 0.0.6 | Phone haptics | MIT (`WEB-HAPTICS-LICENSE.txt`) |
| [cuelume](https://github.com/danielwh2/cuelume) by Daniel Belyi | 0.2.4, changed | Synthesised UI cues | MIT (`CUELUME-LICENSE.txt`) |
| [Magic UI](https://magicui.design) | ported | Shimmer button, progress ring (ported to plain JS) | MIT (`MAGICUI-LICENSE.md`) |
| Kinetics ([kinetics.colorion.co](https://kinetics.colorion.co), by ckissi) | ported | Button, toast, switch and accordion timings (ported to plain JS) | n/a |

## Fonts (`src/fonts/`, SIL Open Font License 1.1)

Bodoni Moda (The Bodoni Moda Project Authors) · Cinzel (The Cinzel Project Authors) · Inter (The Inter Project Authors) · Barlow Condensed (The Barlow Project Authors). See `OFL-*.txt`.

## Sound and music

File by file, with links and changes: [`src/sounds/CREDITS.txt`](src/sounds/CREDITS.txt). Every kit file was cut, levelled and re-encoded as MP3 for Salon Noir.

- **Music:** "Bossa Antigua" and "Lobby Time" by Kevin MacLeod ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the roulette table's track (`music-roulette.mp3`) made for Salon Noir with ElevenLabs Music
- **Thunder:** cut from "Thunderstorm" by [RHumphries](https://freesound.org/people/RHumphries/) (freesound.org), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- **Spark and lightning:** from [/tg/station 13](https://github.com/tgstation/tgstation) and [Space Station 14](https://github.com/space-wizards/space-station-14), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); our edits of them stay CC BY-SA 3.0
- **Roulette ball clicks:** from [matiasvallejosdev/casino-roulette-game](https://github.com/matiasvallejosdev/casino-roulette-game), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); our edits of them stay CC BY-SA 4.0
- **Cards and chips:** [Casino Audio](https://kenney.nl/assets/casino-audio) by [Kenney](https://kenney.nl) and ["Card Game sounds"](https://opengameart.org/content/card-game-sounds) by haeldb, CC0
- **The room:** recordings by felix.blume, SholeColtis and xkeril (freesound.org), CC0, mixed into one loop (`room-casino-1.mp3`)
- **Chip-select thock:** a [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) wood knock with a Kenney clay-chip click, CC0
- **Dealer voices (James and Sofia), cheers, stings and menu sounds:** made for Salon Noir with ElevenLabs (the dealers in the library voices "Jerry B." and "Claire", Eleven v4)
- **The roulette croupier's sounds** (his hand on the wheelhead, the ball's launch, the rake, the dolly): generated for Salon Noir with ElevenLabs Sound Effects v3
- **The rain in the Lightning table's storm** (`rain-window.mp3`): generated for Salon Noir with ElevenLabs Sound Effects v2

## Images

- **Court cards and the ace of spades in play** (`assets/cards/court-belt/`, `assets/cards/ace_of_spades_2.webp`): drawn for Salon Noir (generated art)
- **Card back, felt, leather, the card salon panorama and the salon's carpet** (`assets/table/`): generated for Salon Noir (the panorama and the carpet with FLUX 3 Image through ElevenLabs; the panorama then blurred). `salon-light.webp`, the panorama's light mask (its mirrors, lamps and windows, for the storm), was drawn from it
- **Classic court cards** (`assets/cards/{jack,queen,king}_of_*.webp`), shown only if a drawn court card fails to load: from Howard Yeh's [playing-cards-assets](https://github.com/hayeah/playing-cards-assets), MIT, © 2018 Howard Yeh (`assets/cards/LICENSE.txt`)
- **Wood veneer and the roulette salon panorama** (`assets/roulette/`): generated for Salon Noir (the panorama with FLUX 3 Image through ElevenLabs, then blurred)
- **Card faces, pips, chips and felt lettering:** drawn in code (`src/scene/textures.mjs`)
- **App icons** (`icons/`): rendered from the Salon Noir mark in `src/core/brand.mjs`

## Research

- Blackjack and side-bet rules: Nevada Gaming Control Board's All Bets Blackjack filing; New Jersey 21+3 definitions
- Roulette rules: New Jersey (N.J.A.C. 13:69F-5), Singapore GRA and Monte-Carlo SBM filings
- Wheel: TCS John Huxley and Cammegh specifications
- Ball physics: Small & Tse, "Predicting the outcome of roulette", *Chaos* 22 (2012)
