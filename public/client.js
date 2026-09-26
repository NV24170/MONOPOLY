const socket = io();

let BOARD = [];
let myId = null;
let currentState = null;
const PLAYER_COLORS = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00"];

const GROUP_COLORS = {
  brown: "#955436", lightblue: "#aae0fa", pink: "#d93a96", orange: "#f7941d",
  red: "#ed1b24", yellow: "#fef200", green: "#1fb25a", blue: "#0072bb",
};

fetch("/board-data").then(r => r.json()).then(data => {
  BOARD = data;
  renderBoardShell();
});

// ---- Grid position helper ----
function gridPos(i) {
  if (i <= 10) return { row: 11, col: 11 - i };
  if (i <= 20) return { row: 11 - (i - 10), col: 1 };
  if (i <= 30) return { row: 1, col: 1 + (i - 20) };
  return { row: 1 + (i - 30), col: 11 };
}

function renderBoardShell() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  BOARD.forEach((space, i) => {
    const { row, col } = gridPos(i);
    const div = document.createElement("div");
    div.className = "space";
    div.id = "space-" + i;
    div.style.gridRow = row;
    div.style.gridColumn = col;
    let html = "";
    if (space.group) {
      html += `<div class="color-bar" style="background:${GROUP_COLORS[space.group]}"></div>`;
    }
    html += `<div class="tokens" id="tokens-${i}"></div>`;
    html += `<div class="name">${space.name}</div>`;
    if (space.price) html += `<div class="price">$${space.price}</div>`;
    html += `<div class="owner-tag" id="owner-${i}"></div>`;
    div.innerHTML = html;
    board.appendChild(div);
  });
  const center = document.createElement("div");
  center.className = "center-cell";
  center.textContent = "MONOPOLY";
  board.appendChild(center);
}

// ---- Lobby ----
document.getElementById("joinBtn").onclick = () => {
  const name = document.getElementById("nameInput").value.trim() || "Player";
  const room = document.getElementById("roomInput").value.trim() || "default";
  socket.emit("join_room", { roomId: room, playerName: name }, (res) => {
    if (res.error) {
      document.getElementById("lobbyError").textContent = res.error;
      return;
    }
    myId = res.playerId;
    document.getElementById("waitingRoom").classList.remove("hidden");
    document.getElementById("joinBtn").disabled = true;
    document.getElementById("nameInput").disabled = true;
    document.getElementById("roomInput").disabled = true;
    history.replaceState(null, "", "?room=" + res.roomId);
  });
};

document.getElementById("startBtn").onclick = () => {
  socket.emit("update_rules", {
    auctionOnDecline: document.getElementById("ruleAuction").checked,
    vacationCash: document.getElementById("ruleVacation").checked,
    doubleRentOnMonopoly: document.getElementById("ruleDoubleRent").checked,
  });
  socket.emit("start_game", {}, (res) => {
    if (res.error) alert(res.error);
  });
};

// Auto-fill room from URL
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) document.getElementById("roomInput").value = room;
});

// ---- Game actions ----
document.getElementById("rollBtn").onclick = () => socket.emit("roll_dice", {}, logIfError);
document.getElementById("buyBtn").onclick = () => socket.emit("buy_property", {}, logIfError);
document.getElementById("declineBtn").onclick = () => socket.emit("decline_buy", {}, logIfError);
document.getElementById("endTurnBtn").onclick = () => socket.emit("end_turn", {}, logIfError);
document.getElementById("payJailBtn").onclick = () => socket.emit("pay_jail_fine", {}, logIfError);
document.getElementById("jailCardBtn").onclick = () => socket.emit("use_jail_card", {}, logIfError);
document.getElementById("bidBtn").onclick = () => {
  const amount = parseInt(document.getElementById("bidInput").value, 10);
  if (amount > 0) socket.emit("auction_bid", { amount }, logIfError);
};
document.getElementById("passBtn").onclick = () => socket.emit("auction_pass", {}, logIfError);

document.getElementById("buildBtn").onclick = () => {
  const spaceId = parseInt(document.getElementById("myPropsSelect").value, 10);
  socket.emit("build_house", { spaceId }, logIfError);
};
document.getElementById("sellHouseBtn").onclick = () => {
  const spaceId = parseInt(document.getElementById("myPropsSelect").value, 10);
  socket.emit("sell_house", { spaceId }, logIfError);
};
document.getElementById("mortgageBtn").onclick = () => {
  const spaceId = parseInt(document.getElementById("myPropsSelect").value, 10);
  socket.emit("mortgage_property", { spaceId }, logIfError);
};
document.getElementById("unmortgageBtn").onclick = () => {
  const spaceId = parseInt(document.getElementById("myPropsSelect").value, 10);
  socket.emit("unmortgage_property", { spaceId }, logIfError);
};

document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.value.trim()) {
    socket.emit("chat_message", { text: e.target.value.trim() });
    e.target.value = "";
  }
});

function logIfError(res) {
  if (res && res.error) alert(res.error);
}

socket.on("chat_message", ({ name, text }) => {
  const el = document.getElementById("chatMessages");
  const p = document.createElement("div");
  p.textContent = `${name}: ${text}`;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
});

// ---- State rendering ----
socket.on("state", (state) => {
  currentState = state;
  if (state.started) {
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    renderGame(state);
  } else {
    const list = document.getElementById("playerList");
    list.innerHTML = "";
    state.players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.name;
      list.appendChild(li);
    });
  }
});

function renderGame(state) {
  const isMyTurn = state.currentPlayerId === myId;
  const me = state.players.find(p => p.id === myId);

  // Turn banner
  const current = state.players.find(p => p.id === state.currentPlayerId);
  const banner = document.getElementById("turnBanner");
  if (state.phase === "gameover") {
    banner.textContent = "🏆 Game Over — " + (state.players.find(p => !p.bankrupt)?.name || "?") + " wins!";
  } else {
    banner.textContent = isMyTurn ? "Your turn!" : `${current ? current.name : "?"}'s turn`;
  }

  if (state.lastRoll) {
    document.getElementById("diceDisplay").textContent = `🎲 ${state.lastRoll[0]}  🎲 ${state.lastRoll[1]}`;
  }

  // Buttons visibility
  const show = (id, cond) => document.getElementById(id).classList.toggle("hidden", !cond);
  show("rollBtn", isMyTurn && (state.phase === "preroll") && !me?.inJail);
  show("payJailBtn", isMyTurn && me?.inJail && state.phase === "preroll");
  show("jailCardBtn", isMyTurn && me?.inJail && me.jailCards > 0 && state.phase === "preroll");
  show("rollBtn", isMyTurn && state.phase === "preroll");
  document.getElementById("rollBtn").disabled = false;
  show("buyBtn", isMyTurn && state.phase === "awaiting_buy");
  show("declineBtn", isMyTurn && state.phase === "awaiting_buy");
  show("endTurnBtn", isMyTurn && state.phase === "postroll");
  show("auctionArea", state.phase === "auction");

  if (state.phase === "auction" && state.pendingAuction) {
    const a = state.pendingAuction;
    document.getElementById("auctionSpaceName").textContent = BOARD[a.spaceId].name;
    document.getElementById("auctionHighBid").textContent = a.highestBid;
    const bidder = state.players.find(p => p.id === a.highestBidder);
    document.getElementById("auctionHighBidder").textContent = bidder ? bidder.name : "-";
    const myBidTurn = a.order[a.currentBidderIdx] === myId;
    document.getElementById("bidBtn").disabled = !myBidTurn;
    document.getElementById("passBtn").disabled = !myBidTurn;
  }

  // Players panel
  const playersEl = document.getElementById("players");
  playersEl.innerHTML = "";
  state.players.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "player-card" + (p.id === state.currentPlayerId ? " current" : "");
    div.innerHTML = `<span><span class="swatch" style="background:${PLAYER_COLORS[idx % PLAYER_COLORS.length]}"></span>${p.name}${p.bankrupt ? " (bankrupt)" : ""}${p.inJail ? " 🔒" : ""}</span><span>$${p.cash}</span>`;
    playersEl.appendChild(div);
  });

  // Board tokens & ownership
  BOARD.forEach((space, i) => {
    const tokenEl = document.getElementById("tokens-" + i);
    const ownerEl = document.getElementById("owner-" + i);
    const spaceEl = document.getElementById("space-" + i);
    if (!tokenEl) return;
    tokenEl.innerHTML = "";
    state.players.forEach((p, idx) => {
      if (p.position === i && !p.bankrupt) {
        const t = document.createElement("div");
        t.className = "token";
        t.style.background = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        tokenEl.appendChild(t);
      }
    });
    const owned = state.ownership[i];
    if (owned) {
      const ownerPlayer = state.players.find(p => p.id === owned.ownerId);
      const ownerIdx = state.players.indexOf(ownerPlayer);
      ownerEl.textContent = ownerPlayer ? ownerPlayer.name.slice(0, 3) : "";
      ownerEl.style.background = PLAYER_COLORS[ownerIdx % PLAYER_COLORS.length];
      spaceEl.classList.toggle("house-owned", owned.houses > 0 || owned.hotel);
      if (owned.mortgaged) ownerEl.textContent += " (M)";
    } else {
      ownerEl.textContent = "";
      spaceEl.classList.remove("house-owned");
    }
  });

  // Manage properties dropdown (only my properties)
  const select = document.getElementById("myPropsSelect");
  select.innerHTML = "";
  if (me) {
    me.properties.forEach(id => {
      const space = BOARD[id];
      const owned = state.ownership[id];
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${space.name}${owned.mortgaged ? " (mortgaged)" : ""}${owned.houses ? ` [${owned.houses}h]` : ""}${owned.hotel ? " [hotel]" : ""}`;
      select.appendChild(opt);
    });
  }

  // Log
  const logEl = document.getElementById("log");
  logEl.innerHTML = state.log.map(l => `<div>${l.msg}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
}
