const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Game = require("./game/Game");
const { BOARD } = require("./game/board");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three/build")));
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
  let lastChatMessageAt = 0;

  function getCurrentGame(cb) {
    const game = rooms.get(currentRoomId);
    if (!game && typeof cb === "function") cb({ error: "Join a room first" });
    return game;
  }

  socket.on("join_room", (payload, cb) => {
    if (currentRoomId) {
      if (typeof cb === "function") cb({ error: "Already joined a room" });
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      if (typeof cb === "function") cb({ error: "Room details are invalid" });
      return;
    }
    const roomId = (typeof payload.roomId === "string" ? payload.roomId : "default").trim().toLowerCase() || "default";
    if (roomId.length > 20) {
      if (typeof cb === "function") cb({ error: "Room codes must be 20 characters or fewer" });
      return;
    }
    const playerName = typeof payload.playerName === "string"
      ? payload.playerName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16) || "Player"
      : "Player";
    const game = getOrCreateRoom(roomId);
    const nextPlayerId = socket.id;
    const result = game.addPlayer(nextPlayerId, playerName, socket.id);
    if (result.error) {
      if (typeof cb === "function") cb(result);
      return;
    }
    playerId = nextPlayerId;
    currentRoomId = roomId;
    socket.join(roomId);
    if (typeof cb === "function") cb({ ...result, playerId, roomId });
    broadcast(roomId);
  });

  socket.on("choose_appearance", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.chooseAppearance(playerId, payload?.color);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("start_game", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.start();
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("roll_dice", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.rollDice(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("buy_property", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.buyProperty(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("decline_buy", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.declineBuy(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("auction_bid", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.auctionBid(playerId, payload?.amount);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("auction_pass", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.auctionPass(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("build_house", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.buildHouse(playerId, payload?.spaceId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("sell_house", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.sellHouse(playerId, payload?.spaceId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("mortgage_property", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.mortgageProperty(playerId, payload?.spaceId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("unmortgage_property", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.unmortgageProperty(playerId, payload?.spaceId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("propose_trade", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.proposeTrade(playerId, payload?.toId, payload?.offer);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("respond_trade", (payload, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.respondTrade(playerId, !!payload?.accept);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("cancel_trade", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.cancelTrade(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("pay_jail_fine", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.payJailFine(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("use_jail_card", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.useJailCard(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("end_turn", (_, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    const result = game.endTurn(playerId);
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("update_rules", (rules, cb) => {
    const game = getCurrentGame(cb);
    if (!game) return;
    let result = { ok: true };
    if (game.started) {
      result = { error: "Rules cannot be changed after the game starts" };
    } else if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      result = { error: "Rules are invalid" };
    } else {
      const allowedRules = ["auctionOnDecline", "vacationCash", "doubleRentOnMonopoly", "rentFreeInJail"];
      const updates = {};
      for (const key of allowedRules) {
        if (key in rules && typeof rules[key] === "boolean") updates[key] = rules[key];
      }
      game.rules = { ...game.rules, ...updates };
    }
    if (typeof cb === "function") cb(result);
    broadcast(currentRoomId);
  });

  socket.on("leave_room", (_, cb) => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const roomId = currentRoomId;
      const game = rooms.get(roomId);
      game.removePlayer(playerId);
      socket.leave(roomId);
      currentRoomId = null;
      playerId = null;
      broadcast(roomId);
      if (game.players.length === 0) rooms.delete(roomId);
    }
    if (cb) cb({ ok: true });
  });

  socket.on("chat_message", (payload) => {
    const game = rooms.get(currentRoomId);
    if (!game || typeof payload?.text !== "string") return;
    const text = payload.text.trim().slice(0, 250);
    if (!text) return;
    const now = Date.now();
    if (now - lastChatMessageAt < 250) return;
    lastChatMessageAt = now;
    const player = game.getPlayer(playerId);
    if (!player || player.bankrupt) return;
    io.to(currentRoomId).emit("chat_message", { name: player.name, text });
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
