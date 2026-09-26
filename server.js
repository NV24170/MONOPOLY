const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const Game = require("./game/Game");
const { BOARD } = require("./game/board");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/board-data", (req, res) => res.json(BOARD));
app.get("/health", (req, res) => res.send("ok"));

const rooms = new Map(); // roomId -> Game

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Game(roomId));
  return rooms.get(roomId);
}

function broadcast(roomId) {
  const game = rooms.get(roomId);
  if (game) io.to(roomId).emit("state", game.getState());
}

io.on("connection", (socket) => {
  let currentRoomId = null;
  let playerId = null;

  socket.on("join_room", ({ roomId, playerName }, cb) => {
    roomId = (roomId || "default").trim().toLowerCase();
    const game = getOrCreateRoom(roomId);
    playerId = socket.id;
    currentRoomId = roomId;
    const result = game.addPlayer(playerId, playerName || "Player", socket.id);
    socket.join(roomId);
    if (cb) cb({ ...result, playerId, roomId });
    broadcast(roomId);
  });

  socket.on("choose_appearance", ({ color }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game ? game.chooseAppearance(playerId, color) : { error: "Join a room first" };
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("start_game", (_, cb) => {
    const game = rooms.get(currentRoomId);
    if (!game) return;
    const result = game.start();
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("roll_dice", (_, cb) => {
    const game = rooms.get(currentRoomId);
    if (!game) return;
    const result = game.rollDice(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("buy_property", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.buyProperty(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("decline_buy", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.declineBuy(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("auction_bid", ({ amount }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.auctionBid(playerId, amount);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("auction_pass", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.auctionPass(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("build_house", ({ spaceId }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.buildHouse(playerId, spaceId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("sell_house", ({ spaceId }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.sellHouse(playerId, spaceId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("mortgage_property", ({ spaceId }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.mortgageProperty(playerId, spaceId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("unmortgage_property", ({ spaceId }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.unmortgageProperty(playerId, spaceId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("propose_trade", ({ toId, offer }, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.executeTrade(playerId, toId, offer);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("pay_jail_fine", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.payJailFine(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("use_jail_card", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.useJailCard(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("end_turn", (_, cb) => {
    const game = rooms.get(currentRoomId);
    const result = game.endTurn(playerId);
    if (cb) cb(result);
    broadcast(currentRoomId);
  });

  socket.on("update_rules", (rules, cb) => {
    const game = rooms.get(currentRoomId);
    if (game && !game.started) {
      game.rules = { ...game.rules, ...rules };
    }
    if (cb) cb({ ok: true });
    broadcast(currentRoomId);
  });

  socket.on("chat_message", ({ text }) => {
    const game = rooms.get(currentRoomId);
    if (!game) return;
    const player = game.getPlayer(playerId);
    io.to(currentRoomId).emit("chat_message", { name: player ? player.name : "?", text });
  });

  socket.on("disconnect", () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const game = rooms.get(currentRoomId);
      game.removePlayer(playerId);
      broadcast(currentRoomId);
      if (game.players.length === 0) rooms.delete(currentRoomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Monopoly server running on port ${PORT}`));
