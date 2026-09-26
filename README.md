# Monopoly Online

Real-time multiplayer Monopoly (Node.js + Express + Socket.io). Built to deploy on [Render](https://render.com) as a Web Service.

## Run locally
```bash
npm install
npm start
```
Then open http://localhost:3000 in multiple tabs to test with several players.

## Deploy to Render
**Option A — Blueprint (fastest):**
1. Push this folder to a GitHub repo.
2. In Render: New → Blueprint → connect the repo. It will read `render.yaml` and configure everything automatically.
3. Click Deploy.

**Option B — Manual Web Service:**
1. New → Web Service → connect your repo.
2. Environment: **Node**
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Render sets `PORT` automatically — the server already reads `process.env.PORT`, so no changes needed.

## How to play
1. Everyone opens the deployed URL.
2. Enter a name and the same room code to join together.
3. Once 2+ players have joined, anyone can click **Start Game**.
4. Roll dice, buy properties, build houses/hotels, mortgage, and trade — turns advance automatically, doubles roll again, three doubles sends you to jail.

## What's implemented
- Full 40-space board, all rents (properties, railroads, utilities), houses/hotels with even-building rule
- Buying, auctions on decline (toggleable), mortgage/unmortgage
- Jail (pay/roll doubles/use card, 3-doubles rule)
- Chance & Community Chest (all 32 official cards)
- Bankruptcy (to a player or to the bank) and win detection
- Basic direct player-to-player trading (cash + properties) via `propose_trade` socket event — no trade UI is wired up yet, so it currently needs to be triggered from a custom client call or extended with a trade modal
- Toggleable rules: auction-on-decline, vacation cash (Free Parking pot), x2 rent on unimproved monopolies

## Known simplifications / next steps
- No reconnect/resume-session handling — a page refresh drops you from the room (add player tokens + localStorage session id to fix)
- Trading has no UI (logic is server-ready, just needs a modal in `client.js`)
- No spectator mode or room persistence across server restarts (in-memory only — fine for a single Render instance, but a restart clears active games)
- Selling a hotel currently converts it straight to 4 houses rather than enforcing even sell-down across the group first
