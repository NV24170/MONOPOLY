const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Game = require("./game/Game");
const { BOARD } = require("./game/board");
const { BotDriver } = require("./game/bots");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PUBLIC_DIR = path.join(__dirname, "public");
const LOBBY_GRACE_MS = 15 * 1000; // seat is held this long after a disconnect before the game starts
const GAME_GRACE_MS = 60 * 1000; // ...and this long once the game is running

app.use(express.static(PUBLIC_DIR));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three/build")));
app.get("/board-data", (req, res) => res.json(BOARD));
app.get("/health", (req, res) => res.send("ok"));
// Shareable invite links look like /room/abc12 — the client reads the code from the path.
app.get("/room/:roomId", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const rooms = new Map(); // roomId -> Game

app.get("/rooms", (req, res) => {
  const open = [];
  for (const [id, game] of rooms) {
    const humans = game.humanPlayers();
    if (game.started || game.settings.isPrivate || !humans.some(p => p.connected !== false)) continue;
    if (game.players.length >= game.settings.maxPlayers && !game.players.some(p => p.bot)) continue;
    open.push({
      id,
      players: humans.length,
      max: game.settings.maxPlayers,
      host: game.getPlayer(game.hostId)?.name || "Host",
    });
  }
  res.json(open);
});

function createRoom(roomId, isPrivate) {
  const game = new Game(roomId);
  game.applyRoomDefaults({ isPrivate });
  game.graceTimers = new Map();
  game.driver = new BotDriver(game, () => broadcast(roomId));
  rooms.set(roomId, game);
  return game;
}

function broadcast(roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  io.to(roomId).emit("state", game.getState());
  game.driver.poke();
}

function destroyIfAbandoned(roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  if (game.graceTimers.size || game.humanPlayers().some(p => p.connected !== false)) return;
  for (const timer of game.graceTimers.values()) clearTimeout(timer);
  game.driver.stop();
  rooms.delete(roomId);
}

function cleanSessionId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

io.on("connection", (socket) => {
  let currentRoomId = null;
  let playerId = null;
  let lastChatMessageAt = 0;

  // Registers a game action. `handler(game, data)` returns the result sent to the caller.
  function action(event, handler, { host = false } = {}) {
    socket.on(event, (payload, maybeCb) => {
      const cb = typeof payload === "function" ? payload : maybeCb;
      const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      const game = rooms.get(currentRoomId);
      let result;
      if (!game) result = { error: "Join a room first" };
      else if (host && game.hostId !== playerId) result = { error: "Only the host can do that" };
      else result = handler(game, data);
      if (typeof cb === "function") cb(result);
      if (game) broadcast(currentRoomId);
    });
  }

  function leave() {
    const roomId = currentRoomId;
    const game = rooms.get(roomId);
    if (!game) return;
    clearTimeout(game.graceTimers.get(playerId));
    game.graceTimers.delete(playerId);
    game.removePlayer(playerId);
    socket.leave(roomId);
    currentRoomId = null;
    playerId = null;
    broadcast(roomId);
    destroyIfAbandoned(roomId);
  }

  socket.on("join_room", (payload, cb) => {
    const reply = (value) => { if (typeof cb === "function") cb(value); };
    if (currentRoomId) return reply({ error: "Already joined a room" });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply({ error: "Room details are invalid" });

    const roomId = (typeof payload.roomId === "string" ? payload.roomId : "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,20}$/.test(roomId)) return reply({ error: "Room codes use letters, numbers and dashes (20 max)" });
    const sessionId = cleanSessionId(payload.sessionId) || socket.id;
    const playerName = typeof payload.playerName === "string"
      ? payload.playerName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16) || "Player"
      : "Player";

    if (!rooms.has(roomId) && payload.mustExist) return reply({ error: "That room doesn't exist (anymore)" });
    const game = rooms.get(roomId) || createRoom(roomId, !!payload.isPrivate);

    const existing = game.getPlayer(sessionId);
    if (existing && !existing.bot) {
      // Same browser tab coming back (refresh / network drop): take the seat back.
      clearTimeout(game.graceTimers.get(sessionId));
      game.graceTimers.delete(sessionId);
      existing.socketId = socket.id;
      existing.connected = true;
    } else {
      const result = game.addPlayer(sessionId, playerName, socket.id);
      if (result.error) {
        destroyIfAbandoned(roomId);
        return reply(result);
      }
    }
    playerId = sessionId;
    currentRoomId = roomId;
    socket.join(roomId);
    reply({ ok: true, playerId, roomId });
    broadcast(roomId);
  });

  action("choose_appearance", (game, data) => game.chooseAppearance(playerId, data.color));
  action("start_game", (game) => {
    const humansReady = game.humanPlayers().every(p => p.ready);
    if (!humansReady) return { error: "Everyone must choose an appearance first" };
    return game.start();
  }, { host: true });
  action("update_settings", (game, data) => game.updateSettings({ settings: data.settings, rules: data.rules }), { host: true });
  action("update_rules", (game, data) => game.updateSettings({ rules: data }), { host: true });

  action("roll_dice", (game) => game.rollDice(playerId));
  action("buy_property", (game) => game.buyProperty(playerId));
  action("decline_buy", (game) => game.declineBuy(playerId));
  action("auction_bid", (game, data) => game.auctionBid(playerId, data.amount));
  action("auction_pass", (game) => game.auctionPass(playerId));
  action("build_house", (game, data) => game.buildHouse(playerId, data.spaceId));
  action("sell_house", (game, data) => game.sellHouse(playerId, data.spaceId));
  action("mortgage_property", (game, data) => game.mortgageProperty(playerId, data.spaceId));
  action("unmortgage_property", (game, data) => game.unmortgageProperty(playerId, data.spaceId));
  action("propose_trade", (game, data) => game.proposeTrade(playerId, data.toId, data.offer));
  action("respond_trade", (game, data) => game.respondTrade(playerId, !!data.accept));
  action("cancel_trade", (game) => game.cancelTrade(playerId));
  action("pay_jail_fine", (game) => game.payJailFine(playerId));
  action("use_jail_card", (game) => game.useJailCard(playerId));
  action("end_turn", (game) => game.endTurn(playerId));

  socket.on("leave_room", (_, cb) => {
    leave();
    if (typeof _ === "function") _({ ok: true });
    else if (typeof cb === "function") cb({ ok: true });
  });

  socket.on("chat_message", (payload) => {
    const game = rooms.get(currentRoomId);
    if (!game || typeof payload?.text !== "string") return;
    const text = payload.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 250);
    if (!text) return;
    const now = Date.now();
    if (now - lastChatMessageAt < 250) return;
    lastChatMessageAt = now;
    const player = game.getPlayer(playerId);
    if (!player || player.bankrupt) return;
    io.to(currentRoomId).emit("chat_message", { name: player.name, color: player.color, playerId, text, t: now });
  });

  socket.on("disconnect", () => {
    const roomId = currentRoomId;
    const game = rooms.get(roomId);
    if (!game) return;
    const player = game.getPlayer(playerId);
    if (!player || player.socketId !== socket.id) return; // a newer connection already owns this seat
    player.connected = false;
    broadcast(roomId);
    const id = playerId;
    const timer = setTimeout(() => {
      game.graceTimers.delete(id);
      const stale = game.getPlayer(id);
      if (!stale || stale.connected !== false) return;
      game.removePlayer(id);
      broadcast(roomId);
      destroyIfAbandoned(roomId);
    }, game.started ? GAME_GRACE_MS : LOBBY_GRACE_MS);
    game.graceTimers.set(id, timer);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Monopoly server running on port ${PORT}`));
