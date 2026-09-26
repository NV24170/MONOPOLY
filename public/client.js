const socket = io();

let BOARD = [];
let myId = null;
let currentState = null;
let selectedColor = null;
const PLAYER_COLORS = ["#c1dd4b", "#f8c845", "#ff8741", "#d84a4c", "#54a3e3", "#5dd8df", "#15aa9a", "#69e153", "#aa7e68", "#db49ab", "#f56e97", "#7851dc"];

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

function playerColor(player, index) {
  return player.color || PLAYER_COLORS[index % PLAYER_COLORS.length];
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
    div.style.setProperty("--tile-index", i);
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
  center.innerHTML = `<div class="center-room"><strong>MONOPOLY</strong><span id="centerRoomMessage">Waiting for players</span><button id="roomStartBtn" disabled>Start Game</button></div>`;
  board.appendChild(center);
  document.getElementById("roomStartBtn").onclick = startRoomGame;
  document.querySelectorAll(".appearance-color").forEach(button => {
    button.onclick = () => setSelectedAppearance(button.dataset.color);
  });
  document.getElementById("joinGameBtn").onclick = () => {
    if (!selectedColor) return;
    socket.emit("choose_appearance", { color: selectedColor }, (res) => {
      document.getElementById("appearanceError").textContent = res?.error || "";
    });
  };
}

function setSelectedAppearance(color) {
  selectedColor = color;
  document.querySelectorAll(".appearance-color").forEach(button => {
    button.classList.toggle("selected", button.dataset.color === color);
  });
}

function syncAppearancePicker(state) {
  const player = state.players.find(p => p.id === myId);
  const choosing = !!player && !player.ready;
  const overlay = document.getElementById("appearanceOverlay");
  const board = document.getElementById("board");
  overlay.classList.toggle("hidden", !choosing);
  board.classList.toggle("appearance-blurred", choosing);
  document.getElementById("appearanceError").textContent = "";
  if (!choosing) return;

  const unavailable = state.players.filter(p => p.id !== myId && !p.bankrupt).map(p => p.color);
  document.querySelectorAll(".appearance-color").forEach(button => {
    const taken = unavailable.includes(button.dataset.color);
    button.disabled = taken;
    button.classList.toggle("taken", taken);
  });
  if (!selectedColor || unavailable.includes(selectedColor)) {
    selectedColor = PLAYER_COLORS.find(color => !unavailable.includes(color)) || player.color;
  }
  setSelectedAppearance(selectedColor);
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

document.getElementById("createRoomBtn").onclick = () => {
  document.getElementById("roomInput").value = Math.random().toString(36).slice(2, 8);
  document.getElementById("joinBtn").click();
};

document.getElementById("copyRoomBtn").onclick = async () => {
  const status = document.getElementById("copyStatus");
  try {
    await navigator.clipboard.writeText(document.getElementById("shareLink").value);
    status.textContent = "Invite link copied";
  } catch {
    status.textContent = "Copy the invite link from the field above";
    document.getElementById("shareLink").select();
  }
};

function startGameWithRules(rules) {
  socket.emit("update_rules", rules, () => {
    socket.emit("start_game", {}, (res) => {
      if (res.error) alert(res.error);
    });
  });
}

function roomRules() {
  return {
    auctionOnDecline: document.getElementById("roomRuleAuction").checked,
    vacationCash: document.getElementById("roomRuleVacation").checked,
    doubleRentOnMonopoly: document.getElementById("roomRuleDoubleRent").checked,
  };
}

function startRoomGame() {
  startGameWithRules(roomRules());
}

document.getElementById("startBtn").onclick = () => {
  startGameWithRules({
    auctionOnDecline: document.getElementById("ruleAuction").checked,
    vacationCash: document.getElementById("ruleVacation").checked,
    doubleRentOnMonopoly: document.getElementById("ruleDoubleRent").checked,
  });
};

["roomRuleAuction", "roomRuleVacation", "roomRuleDoubleRent"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => socket.emit("update_rules", roomRules()));
});

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
  if (e.key === "Enter") sendChat();
});
document.getElementById("sendChatBtn").onclick = sendChat;

function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat_message", { text });
  input.value = "";
}

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
    document.getElementById("roomSettings").classList.add("hidden");
    document.querySelector(".rules-summary").classList.remove("hidden");
    document.querySelector(".manage").classList.remove("hidden");
    document.getElementById("appearanceOverlay").classList.add("hidden");
    document.getElementById("board").classList.remove("appearance-blurred");
    document.getElementById("roomStartBtn").classList.add("hidden");
    renderGame(state);
  } else if (myId) {
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    renderGame(state);
    document.getElementById("turnBanner").textContent = "Waiting for players";
    const readyCount = state.players.filter(player => player.ready).length;
    const canStart = state.players.length >= 2 && readyCount === state.players.length;
    document.getElementById("roomStartBtn").disabled = !canStart;
    document.getElementById("centerRoomMessage").textContent = state.players.length < 2 ? "Waiting for players..." : canStart ? "Everyone is in · ready to play" : `${readyCount} of ${state.players.length} players ready`;
    document.getElementById("roomSettings").classList.remove("hidden");
    document.querySelector(".rules-summary").classList.add("hidden");
    document.querySelector(".manage").classList.add("hidden");
    document.getElementById("roomRuleAuction").checked = !!state.rules.auctionOnDecline;
    document.getElementById("roomRuleVacation").checked = !!state.rules.vacationCash;
    document.getElementById("roomRuleDoubleRent").checked = !!state.rules.doubleRentOnMonopoly;
    syncAppearancePicker(state);
  } else {
    const list = document.getElementById("playerList");
    list.innerHTML = "";
    state.players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.name;
      list.appendChild(li);
    });
  }
  const roomLabel = document.getElementById("roomLabel");
  roomLabel.textContent = state.roomId ? `Room ${state.roomId}` : "";
  document.getElementById("shareLink").value = state.roomId ? `${window.location.origin}/?room=${encodeURIComponent(state.roomId)}` : "";
  const rules = state.rules || {};
  document.getElementById("currentRuleList").innerHTML = [
    ["Auction on decline", rules.auctionOnDecline],
    ["Vacation cash", rules.vacationCash],
    ["Double rent on full sets", rules.doubleRentOnMonopoly],
    ["Rent-free while in jail", rules.rentFreeInJail],
  ].map(([label, enabled]) => `<div class="rule-summary-row"><span>${label}</span><span class="rule-state ${enabled ? "on" : "off"}">${enabled ? "On" : "Off"}</span></div>`).join("");
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
    const location = BOARD[p.position]?.name || "Unknown space";
    div.innerHTML = `<span><span class="swatch" style="background:${playerColor(p, idx)}">${idx + 1}</span>${p.name}${p.bankrupt ? " (bankrupt)" : ""}${p.inJail ? " 🔒" : ""}</span><span class="player-location" title="${location}">${location}</span><span>$${p.cash}</span>`;
    playersEl.appendChild(div);
  });

  // Board tokens & ownership
  BOARD.forEach((space, i) => {
    const tokenEl = document.getElementById("tokens-" + i);
    const ownerEl = document.getElementById("owner-" + i);
    const spaceEl = document.getElementById("space-" + i);
    if (!tokenEl) return;
    const currentPlayerHere = state.players.some(p => p.id === state.currentPlayerId && p.position === i && !p.bankrupt);
    spaceEl.classList.toggle("current-turn-space", currentPlayerHere);
    tokenEl.innerHTML = "";
    state.players.forEach((p, idx) => {
      if (p.position === i && !p.bankrupt) {
        const t = document.createElement("div");
        t.className = "token";
        t.style.background = playerColor(p, idx);
        t.textContent = String(idx + 1);
        t.title = `${p.name} at ${space.name}`;
        t.setAttribute("aria-label", `${p.name} at ${space.name}`);
        tokenEl.appendChild(t);
      }
    });
    const owned = state.ownership[i];
    if (owned) {
      const ownerPlayer = state.players.find(p => p.id === owned.ownerId);
      const ownerIdx = state.players.indexOf(ownerPlayer);
      ownerEl.textContent = ownerPlayer ? ownerPlayer.name.slice(0, 3) : "";
      ownerEl.style.background = playerColor(ownerPlayer, ownerIdx);
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
