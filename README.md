<div align="center">

# Salon Noir

**A private casino in the browser.** First-person 3D blackjack and European roulette, built for a few friends around one screen.

![JavaScript](https://img.shields.io/badge/JavaScript-ES%20modules-c9a45c?style=flat-square&labelColor=141416)
![three.js](https://img.shields.io/badge/3D-three.js-c9a45c?style=flat-square&labelColor=141416)
![No build step](https://img.shields.io/badge/build-none-c9a45c?style=flat-square&labelColor=141416)
![Play chips only](https://img.shields.io/badge/money-play%20chips%20only-c9a45c?style=flat-square&labelColor=141416)

![The Salon Noir lobby](docs/screenshots/lobby.jpg)

</div>

## Tables

| | Table | What makes it different |
|---|---|---|
| ♠ | **Classic Blackjack** | Eight decks, blackjack pays 3:2, six side bets (Lucky Lucky, Perfect Pairs, Top 3, 21+3, Buster, Dealer Pairs) |
| ⓕ | **Free Bet Blackjack** | Free doubles on hard 9–11, free splits on most pairs, dealer 22 pushes |
| ⚡ | **Lightning Blackjack** | Lightning strikes multipliers onto final totals, up to 25× on your next win |
| ◎ | **European Roulette** | Single zero, full racetrack with Voisins, Tiers, Orphelins and neighbours, physically simulated ball |
| 🔒 | **Lightning Roulette** | Coming soon |

One chip balance follows you from table to table.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/blackjack.jpg" alt="Classic blackjack table"></td>
<td width="50%"><img src="docs/screenshots/roulette.jpg" alt="European roulette table"></td>
</tr>
</table>

## Highlights

- **Real 3D table** in three.js, seen from your seat, with the camera fitted to your screen (desktop or upright phone)
- **Dealers with personalities.** James, Marco, Elena and Sofia each deal at their own pace, and James and Sofia speak their calls
- **AI players** at the table with their own bankrolls and styles, from basic strategy to gut feel
- **Roulette ball physics** based on published research, simulated rather than animated
- **Casino-grade sound:** spatial card and chip sounds, ducking music, a room you can hear
- **Phone-first touches:** haptics, graphics presets, battery saver, reduced motion
- **Rules from real filings:** blackjack and side bets after Nevada and New Jersey, roulette after New Jersey, Singapore and Monte-Carlo

## Run it

No install, no build. Serve the folder and open it in a browser:

```bash
git clone https://github.com/onealper/salon-noir.git
cd salon-noir
python3 -m http.server 8000
```

Then go to **http://localhost:8000**. (Opening `index.html` directly won't work, because browsers block ES modules on `file://`.)

To play on a phone, connect it to the same Wi-Fi and open `http://<your-computer's-IP>:8000`.

### Keys

| Key | Action |
|---|---|
| `1`–`7` | Pick a chip |
| `Space` | Deal / spin |
| `H` `S` `D` `P` | Hit, stand, double, split |
| `U` `C` `R` `X` | Undo, clear, rebet, double bets |
| `Y` `N` | Insurance yes / no |

## Project layout

```
index.html        Page shell
src/              All code, styles, fonts, sounds and vendored libraries
  game.mjs        Main controller (start reading here)
  engine.mjs      Blackjack rules engine
  core/           Lobby, wallet, table modes, branding, haptics
  scene/          Blackjack 3D scene
  roulette/       Roulette game, rules, physics and 3D
assets/           Card art and table and wood textures
docs/             Screenshots
```

## Working on it

Start with **[PROJECT.md](PROJECT.md)**. It's the full brief (architecture, file map, design rules and what's next), written so any developer or AI assistant can pick up the work.

## Credits

Built on open-source libraries and openly licensed sounds and fonts. See **[CREDITS.md](CREDITS.md)**.

---

<sub>Private project. Play chips only, no real money.</sub>
