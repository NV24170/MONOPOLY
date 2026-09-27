# CCP Monopoly

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
- Player-to-player trade proposals with cash and property offers, recipient acceptance/rejection, cancellation, and server-side validation
- Toggleable rules: auction-on-decline, vacation cash (Free Parking pot), x2 rent on unimproved monopolies, rent-free while in jail

## Known simplifications / next steps
- No reconnect/resume-session handling — a page refresh drops you from the room (add player tokens + localStorage session id to fix)
- No spectator mode or room persistence across server restarts (in-memory only — fine for a single Render instance, but a restart clears active games)

## Game Link
https://monopoly-app-zel6.onrender.com