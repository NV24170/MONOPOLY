# CCP Monopoly

Real-time multiplayer Monopoly (Node.js + Express + Socket.io) with a richup.io-style lobby, animated board and a synthesized sound track. Built to deploy on [Render](https://render.com) as a Web Service.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. Use several tabs to test with multiple players (each tab is its own player).

## Deploy to Render
**Blueprint (fastest):** push this folder to GitHub, then Render -> New -> Blueprint -> pick the repo. It reads `render.yaml`.
**Manual:** New -> Web Service, Environment `Node`, Build `npm install`, Start `npm start`. `PORT` is provided by Render.

## How to play
1. Enter a name and press **Play** (joins/creates a public room), or **Create a private game** and share the invite link (`/room/<code>`).
2. Everyone picks an appearance colour and presses **Join game**.
3. The host tweaks settings (max players, private room, bots, starting cash, rules) and presses **Start Game**.
4. Roll, buy, build, trade, mortgage. Doubles roll again; three doubles = prison.

## Highlights
- Landing page, room browser ("All rooms"), private rooms, invite links, host-only settings.
- Bots (beta) fill empty seats, and give their seat up to humans who join.
- Refresh-safe: a reload or brief network drop returns you to your seat (seats are held 15s in the lobby, 60s in a running game).
- Animations for every play: 3D dice, token hopping tile by tile (flying to prison, walking back), card flips, coins flying on rent, floating +/- cash, property purchase bursts, house/hotel pop-ins, mortgage/tax shakes, bankruptcies, auction, and a winner celebration with confetti.
- Sound effects generated with WebAudio (toggle in the top bar); `prefers-reduced-motion` is respected.
- Rules: 40-space board, all 32 cards, even-build (toggle), mortgages (toggle), auctions (toggle), vacation cash, x2 rent on full sets, no rent while owner is in prison, trading with server-side validation.

## Project layout
```
server.js        Express + Socket.io (rooms, host controls, reconnect, /rooms)
game/Game.js     Rules engine (emits animation events with every action)
game/board.js    Board and cards
game/bots.js     Bot player driver
public/          index.html, styles.css, client.js (state + animation queue),
                 panels.js, board-view.js, store.js, sfx.js, ui-assets.js, dice3d.js
test/            node --test
```

## Notes
- Rooms are in memory: a server restart clears active games (fine for one Render instance).
- Tests: `npm test`.
