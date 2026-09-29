const socket = io();

let BOARD = [];
let myId = null;
let currentState = null;
let selectedColor = null;
let diceAnimator = null;
let lastAnimatedRollSequence = 0;
const PLAYER_COLORS = ["#c1dd4b", "#f8c845", "#ff8741", "#d84a4c", "#54a3e3", "#5dd8df", "#15aa9a", "#69e153", "#aa7e68", "#db49ab", "#f56e97", "#7851dc"];

import("./dice3d.js").then(({ createDiceAnimator }) => {
  diceAnimator = createDiceAnimator(document.getElementById("dice3d"));
  if (!diceAnimator) document.getElementById("diceStage").classList.add("dice-fallback");
  else if (currentState?.lastRoll) diceAnimator.rollTo(currentState.lastRoll);
}).catch(() => {
  document.getElementById("diceStage").classList.add("dice-fallback");
});

const GROUP_COLORS = {
  brown: "#ff9b62", lightblue: "#36d9ff", pink: "#ff48c8", orange: "#ffad3f",
  red: "#ff4f6d", yellow: "#f6f35a", green: "#67f59a", blue: "#74a4ff",
};
const COUNTRY_FLAGS = {
  Salvador: "br", Rio: "br", "Tel Aviv": "il", Haifa: "il", Jerusalem: "il",
  Venice: "it", Milan: "it", Rome: "it", Frankfurt: "de", Munich: "de", Berlin: "de",
  Shenzhen: "cn", Beijing: "cn", Shanghai: "cn", Lyon: "fr", Toulouse: "fr", Paris: "fr",
  Liverpool: "gb", Manchester: "gb", London: "gb", "San Francisco": "us", "New York": "us",
};
const FLAG_ART = {
  br: '<circle fill="#168b4b" cx="18" cy="18" r="18"/><path fill="#f7d447" d="m18 5 14 13-14 13L4 18z"/><circle fill="#2454a4" cx="18" cy="18" r="7"/>',
  il: '<circle fill="#fff" cx="18" cy="18" r="18"/><path stroke="#1768ae" stroke-width="2.5" d="M5 11h26M5 25h26"/><path fill="none" stroke="#1768ae" stroke-width="1.7" d="m18 11 6 10H12z m0 14-6-10h12z"/>',
  it: '<circle fill="#fff" cx="18" cy="18" r="18"/><path fill="#159447" d="M0 0h12v36H0z"/><path fill="#df3d46" d="M24 0h12v36H24z"/>',
  de: '<circle fill="#d9363e" cx="18" cy="18" r="18"/><path fill="#17191d" d="M0 0h36v12H0z"/><path fill="#f4c847" d="M0 24h36v12H0z"/>',
  cn: '<circle fill="#df2636" cx="18" cy="18" r="18"/><path fill="#ffdf4c" d="m10 7 1.1 3.2h3.3l-2.7 2 1 3.2-2.7-2-2.7 2 1-3.2-2.7-2h3.3z m9 1 .5 1.4H21l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m3 4 .5 1.4H24l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m-.5 6 .5 1.4h1.5l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m-3 5 .5 1.4h1.5l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z"/>',
  fr: '<circle fill="#fff" cx="18" cy="18" r="18"/><path fill="#2454a4" d="M0 0h12v36H0z"/><path fill="#e33d49" d="M24 0h12v36H24z"/>',
  gb: '<circle fill="#23437c" cx="18" cy="18" r="18"/><path stroke="#fff" stroke-width="8" d="m2 2 32 32M34 2 2 34"/><path stroke="#d83c4a" stroke-width="3" d="m2 2 32 32M34 2 2 34"/><path stroke="#fff" stroke-width="12" d="M18 0v36M0 18h36"/><path stroke="#d83c4a" stroke-width="5" d="M18 0v36M0 18h36"/>',
  us: '<circle fill="#fff" cx="18" cy="18" r="18"/><path stroke="#d73c4b" stroke-width="3" d="M0 5h36M0 11h36M0 17h36M0 23h36M0 29h36M0 35h36"/><path fill="#2454a4" d="M0 0h18v19H0z"/><path fill="#fff" d="m4 3 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m7 0 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-3.5 6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m7 0 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-7 6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-3.5-6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z"/>',
};

function flagSvg(flag, id) {
  const clipId = `flag-clip-${id}`;
  return `<svg viewBox="0 0 36 36" aria-hidden="true"><defs><clipPath id="${clipId}"><circle cx="18" cy="18" r="17"/></clipPath></defs><g clip-path="url(#${clipId})">${FLAG_ART[flag]}</g><circle cx="18" cy="18" r="17" fill="none" stroke="#fff" stroke-width="1.5"/></svg>`;
}
const TILE_ICONS = {
  chest: '<svg viewBox="0 0 64 64"><path d="M10 26h44v27H10z" fill="#cf762e" stroke="currentColor" stroke-width="3"/><path d="M8 23h48v9H8z" fill="#f0b84d" stroke="currentColor" stroke-width="3"/><path d="M17 22c0-9 7-15 15-15s15 6 15 15" fill="#d99036" stroke="currentColor" stroke-width="3"/><path d="M27 33h10v13H27z" fill="#ffda68" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="39" r="2" fill="#8b4c2a"/></svg>',
  invoice: '<svg viewBox="0 0 64 64"><path d="M17 7h22l10 10v40H17z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M39 8v11h10M24 29h18M24 37h18M24 45h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  plane: '<svg viewBox="0 0 64 64"><path d="m32 5 6 4 2 18 17 12v6L39 40l-2 16-5 3-5-3-2-16L8 45v-6l17-12 2-18z" fill="currentColor"/><path d="M27 43h10" stroke="#8793a5" stroke-width="3"/></svg>',
  bolt: '<svg viewBox="0 0 64 64"><path d="M36 4 14 36h15l-2 24 23-35H34z" fill="#ffd34e" stroke="#fff0a0" stroke-width="2" stroke-linejoin="round"/></svg>',
  water: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 12c-6 9-14 18-14 27a14 14 0 0 0 28 0c0-9-8-18-14-27Z" fill="#7bd4ec" stroke="currentColor" stroke-width="2.5"/><path d="M25 42c1 4 4 6 8 6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
  vacation: '<svg viewBox="0 0 64 64"><path d="m12 10 21 4-8 26-21-5z" fill="#fff" stroke="#d9dce7" stroke-width="2"/><path d="m7 35 18 4M18 40v11m22-13h14l-3 11H38zM40 49l-5 8m14-8 5 8M38 38l-6-7" fill="none" stroke="#5ebd72" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cage: '<svg viewBox="0 0 64 64"><path d="M8 9h48v47H8z" fill="#78808d"/><path d="M10 8v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49m4.4-49v49M8 18h48M8 47h48" stroke="#f4f5f7" stroke-width="2.5"/></svg>',
  cap: '<svg viewBox="0 0 64 64"><path d="M9 35c2-10 11-17 23-17s21 7 23 17l-3 9H12z" fill="#f6f7fa"/><path d="M8 36h48c0 5-5 9-12 10H19C12 45 8 41 8 36Z" fill="#cbd3e1"/><path d="m21 23 11-8 11 8M26 19h12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  diamond: '<svg viewBox="0 0 64 64"><path d="m13 25 9-13h20l9 13-19 27z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="m13 25 19 3 19-3M22 12l10 16 10-16M32 28v24" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

function tileIcon(space, edge) {
  if (space.type === "community_chest") return TILE_ICONS.chest;
  if (space.type === "tax") return space.id === 38 ? TILE_ICONS.diamond : TILE_ICONS.invoice;
  if (space.type === "railroad") return `<span class="plane-icon edge-${edge}">${TILE_ICONS.plane}</span>`;
  if (space.type === "utility") return space.id === 28 ? TILE_ICONS.water : TILE_ICONS.bolt;
  if (space.type === "chance") return '<span class="chance-mark">?</span>';
  if (space.type === "free_parking") return TILE_ICONS.vacation;
  if (space.type === "jail") return TILE_ICONS.cage;
  if (space.type === "go_to_jail") return TILE_ICONS.cap;
  return "";
}

fetch("/board-data").then(r => r.json()).then(data => {
  BOARD = data;
  renderBoardShell();
});

// ---- Grid position helper ----
function gridPos(i) {
  if (i === 0) return { row: "1 / span 2", col: "1 / span 2", edge: "corner" };
  if (i <= 9) return { row: "1 / span 2", col: i + 2, edge: "edge-top" };
  if (i === 10) return { row: "1 / span 2", col: "12 / span 2", edge: "corner" };
  if (i <= 19) return { row: i - 8, col: "12 / span 2", edge: "edge-right" };
  if (i === 20) return { row: "12 / span 2", col: "12 / span 2", edge: "corner" };
  if (i <= 29) return { row: "12 / span 2", col: 32 - i, edge: "edge-bottom" };
  if (i === 30) return { row: "12 / span 2", col: "1 / span 2", edge: "corner" };
  return { row: 42 - i, col: "1 / span 2", edge: "edge-left" };
}

function playerColor(player, index) {
  return player.color || PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function renderBoardShell() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  BOARD.forEach((space, i) => {
    const { row, col, edge } = gridPos(i);
    const div = document.createElement("div");
    div.className = `space tile-${space.type}${edge === "corner" ? " corner-tile" : ""} ${edge}`;
    div.id = "space-" + i;
    div.style.gridRow = row;
    div.style.gridColumn = col;
    div.style.setProperty("--tile-index", i);
    const symbol = document.createElement("div");
    symbol.className = "tile-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.innerHTML = tileIcon(space, edge);
    div.appendChild(symbol);
    if (space.group) {
      const colorBar = document.createElement("div");
      colorBar.className = "color-bar";
      colorBar.style.background = GROUP_COLORS[space.group];
      div.appendChild(colorBar);
    }
    const tokens = document.createElement("div");
    tokens.className = "tokens";
    tokens.id = `tokens-${i}`;
    const flag = COUNTRY_FLAGS[space.name];
    if (flag) {
      const flagBadge = document.createElement("span");
      flagBadge.className = "country-flag";
      flagBadge.innerHTML = flagSvg(flag, space.id);
      flagBadge.setAttribute("aria-label", `${space.name} country flag`);
      div.appendChild(flagBadge);
    }
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = space.name;
    div.append(tokens, name);
    if (space.price || space.id === 38) {
      const price = document.createElement("div");
      price.className = "price";
      price.textContent = space.id === 38 ? "$75" : `${space.price}$`;
      div.appendChild(price);
    }
    const owner = document.createElement("div");
    owner.className = "owner-tag";
    owner.id = `owner-${i}`;
    div.appendChild(owner);
    board.appendChild(div);
  });
  const center = document.createElement("div");
  center.className = "center-cell";
  center.innerHTML = `<div class="center-arena"><div class="center-room"><img class="center-logo" src="/ccp-monopoly.svg" alt="CCP Monopoly"><span id="centerRoomMessage" aria-live="polite">Waiting for players</span><div class="room-actions"><button id="roomSettingsBtn" class="center-settings-button" type="button">Settings</button><button id="roomStartBtn" disabled>Start Game</button></div><span id="roomStartError" class="room-start-error" aria-live="polite"></span></div><div class="arena-brand"><span>RICHUP<strong>.IO</strong></span></div></div>`;
  center.querySelector(".center-arena").append(
    document.getElementById("diceArea"),
    document.getElementById("logPanel"),
  );
  board.appendChild(center);
  document.getElementById("roomStartBtn").onclick = startRoomGame;
  const openRoomSettings = () => document.getElementById("roomSettingsDialog").showModal();
  document.getElementById("roomSettingsBtn").onclick = openRoomSettings;
  document.getElementById("appearanceSettingsBtn").onclick = openRoomSettings;
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
    history.replaceState(null, "", "?room=" + encodeURIComponent(res.roomId));
  });
};

document.getElementById("createRoomBtn").onclick = () => {
  document.getElementById("roomInput").value = Math.random().toString(36).slice(2, 8);
  document.getElementById("joinBtn").click();
};

document.getElementById("copyRoomBtn").onclick = async () => {
  const status = document.getElementById("copyStatus");
  const url = document.getElementById("shareLink").value;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my CCP Monopoly game", url });
      status.textContent = "Invite shared";
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = "Invite link copied";
  } catch {
    status.textContent = "Copy the invite link from the field above";
    document.getElementById("shareLink").select();
  }
};

document.getElementById("leaveRoomBtn").onclick = () => {
  if (!confirm("Leave this room? Your player will be removed from the game.")) return;
  socket.emit("leave_room", {}, () => {
    socket.disconnect();
    window.location.href = "/";
  });
};

function startGameWithRules(rules) {
  const showError = (message) => {
    const error = document.getElementById("roomStartError");
    if (error) error.textContent = message;
    else document.getElementById("lobbyError").textContent = message;
  };
  showError("");
  socket.emit("update_rules", rules, (updateResult) => {
    if (updateResult?.error) {
      showError(updateResult.error);
      return;
    }
    socket.emit("start_game", {}, (res) => {
      if (res?.error) showError(res.error);
    });
  });
}

function roomRules() {
  return {
    auctionOnDecline: document.getElementById("roomRuleAuction").checked,
    vacationCash: document.getElementById("roomRuleVacation").checked,
    doubleRentOnMonopoly: document.getElementById("roomRuleDoubleRent").checked,
    rentFreeInJail: document.getElementById("roomRuleRentFree").checked,
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

["roomRuleAuction", "roomRuleVacation", "roomRuleDoubleRent", "roomRuleRentFree"].forEach(id => {
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

document.getElementById("tradeOpenBtn").onclick = openTradeDialog;
document.getElementById("settingsCloseBtn").onclick = () => document.getElementById("roomSettingsDialog").close();
document.getElementById("settingsDoneBtn").onclick = () => document.getElementById("roomSettingsDialog").close();
document.getElementById("tradeCloseBtn").onclick = () => document.getElementById("tradeDialog").close();
document.getElementById("tradeCancelBtn").onclick = () => document.getElementById("tradeDialog").close();
document.getElementById("tradeTarget").addEventListener("change", renderTradeProperties);
document.getElementById("tradeSendBtn").onclick = sendTradeOffer;
document.getElementById("acceptTradeBtn").onclick = () => socket.emit("respond_trade", { accept: true }, logIfError);
document.getElementById("rejectTradeBtn").onclick = () => socket.emit("respond_trade", { accept: false }, logIfError);
document.getElementById("cancelTradeBtn").onclick = () => socket.emit("cancel_trade", {}, logIfError);

function openTradeDialog() {
  if (!currentState || !myId || currentState.pendingTrade) return;
  const me = currentState.players.find(player => player.id === myId);
  const opponents = currentState.players.filter(player => player.id !== myId && !player.bankrupt);
  const targetSelect = document.getElementById("tradeTarget");
  targetSelect.innerHTML = "";
  opponents.forEach(player => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    targetSelect.appendChild(option);
  });
  document.getElementById("tradeFromCash").max = me.cash;
  document.getElementById("tradeFromCash").value = 0;
  document.getElementById("tradeToCash").value = 0;
  document.getElementById("tradeDialogError").textContent = opponents.length ? "" : "No other active players are available.";
  document.getElementById("tradeSendBtn").disabled = opponents.length === 0;
  renderTradeProperties();
  document.getElementById("tradeDialog").showModal();
}

function renderTradeProperties() {
  if (!currentState || !myId) return;
  const targetId = document.getElementById("tradeTarget").value;
  const me = currentState.players.find(player => player.id === myId);
  const target = currentState.players.find(player => player.id === targetId);
  const renderOptions = (containerId, player, prefix) => {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    if (!player) return;
    const tradable = player.properties.filter(id => {
      const ownership = currentState.ownership[id];
      return ownership && !ownership.houses && !ownership.hotel;
    });
    if (!tradable.length) {
      const empty = document.createElement("div");
      empty.className = "trade-empty";
      empty.textContent = "No tradable properties";
      container.appendChild(empty);
      return;
    }
    tradable.forEach(id => {
      const ownership = currentState.ownership[id];
      const label = document.createElement("label");
      label.className = "trade-property-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = id;
      checkbox.name = prefix;
      const name = document.createElement("span");
      name.textContent = `${BOARD[id].name}${ownership.mortgaged ? " · mortgaged" : ""}`;
      label.append(checkbox, name);
      container.appendChild(label);
    });
  };
  renderOptions("tradeFromProps", me, "fromProperty");
  renderOptions("tradeToProps", target, "toProperty");
  document.getElementById("tradeToCash").max = target?.cash || 0;
}

function sendTradeOffer() {
  const toId = document.getElementById("tradeTarget").value;
  const offer = {
    fromCash: Number(document.getElementById("tradeFromCash").value || 0),
    toCash: Number(document.getElementById("tradeToCash").value || 0),
    fromProps: [...document.querySelectorAll("#tradeFromProps input:checked")].map(input => Number(input.value)),
    toProps: [...document.querySelectorAll("#tradeToProps input:checked")].map(input => Number(input.value)),
  };
  socket.emit("propose_trade", { toId, offer }, result => {
    if (result?.error) {
      document.getElementById("tradeDialogError").textContent = result.error;
      return;
    }
    document.getElementById("tradeDialog").close();
  });
}

function renderTradeOffer(state) {
  const panel = document.getElementById("tradeOfferPanel");
  const pending = state.pendingTrade;
  const involved = pending && (pending.fromId === myId || pending.toId === myId);
  panel.classList.toggle("hidden", !involved);
  document.getElementById("tradeOpenBtn").disabled = !state.started || !!pending || state.players.filter(player => !player.bankrupt && player.id !== myId).length === 0;
  if (!involved) return;

  const from = state.players.find(player => player.id === pending.fromId);
  const to = state.players.find(player => player.id === pending.toId);
  const names = ids => ids.map(id => BOARD[id]?.name || "Unknown property").join(", ");
  const describe = (cash, ids) => [cash ? `$${cash}` : "", names(ids)].filter(Boolean).join(" + ") || "nothing";
  const fromOffer = describe(pending.offer.fromCash, pending.offer.fromProps);
  const toOffer = describe(pending.offer.toCash, pending.offer.toProps);
  const isRecipient = pending.toId === myId;
  document.getElementById("tradeOfferTitle").textContent = isRecipient ? `Offer from ${from?.name || "player"}` : `Offer sent to ${to?.name || "player"}`;
  document.getElementById("tradeOfferText").textContent = `${fromOffer} for ${toOffer}`;
  document.getElementById("acceptTradeBtn").classList.toggle("hidden", !isRecipient);
  document.getElementById("rejectTradeBtn").classList.toggle("hidden", !isRecipient);
  document.getElementById("cancelTradeBtn").classList.toggle("hidden", isRecipient);
}

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
  while (el.children.length > 100) el.firstElementChild.remove();
  el.scrollTop = el.scrollHeight;
});

// ---- State rendering ----
socket.on("state", (state) => {
  currentState = state;
  document.getElementById("game").classList.toggle("game-started", state.started);
  if (state.started) {
    const settingsDialog = document.getElementById("roomSettingsDialog");
    if (settingsDialog.open) settingsDialog.close();
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
    const readyPlayers = state.players.filter(player => player.ready);
    const readyCount = readyPlayers.length;
    const canStart = state.players.length >= 2 && readyCount === state.players.length;
    document.getElementById("roomStartBtn").disabled = !canStart;
    document.getElementById("centerRoomMessage").textContent = state.players.length < 2
      ? "Invite at least one other player to start."
      : canStart
        ? "Everyone is ready. Start the game when you're set."
        : `Waiting for ${state.players.filter(player => !player.ready).map(player => player.name).join(", ")} to choose a token · ${readyCount} of ${state.players.length} ready.`;
    document.getElementById("roomSettings").classList.remove("hidden");
    document.querySelector(".rules-summary").classList.add("hidden");
    document.querySelector(".manage").classList.add("hidden");
    document.getElementById("roomRuleAuction").checked = !!state.rules.auctionOnDecline;
    document.getElementById("roomRuleVacation").checked = !!state.rules.vacationCash;
    document.getElementById("roomRuleDoubleRent").checked = !!state.rules.doubleRentOnMonopoly;
    document.getElementById("roomRuleRentFree").checked = !!state.rules.rentFreeInJail;
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
  renderTradeOffer(state);
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
    document.getElementById("diceDisplay").textContent = `${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0] + state.lastRoll[1]}`;
    if (state.rollSequence && state.rollSequence !== lastAnimatedRollSequence) {
      lastAnimatedRollSequence = state.rollSequence;
      diceAnimator?.rollTo(state.lastRoll);
    }
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
    const identity = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = playerColor(p, idx);
    swatch.setAttribute("aria-hidden", "true");
    swatch.innerHTML = '<i class="googly-eye"></i><i class="googly-eye"></i>';
    const name = document.createElement("span");
    name.textContent = `${p.name}${p.bankrupt ? " (bankrupt)" : ""}${p.inJail ? " 🔒" : ""}`;
    identity.append(swatch, name);

    const locationLabel = document.createElement("span");
    locationLabel.className = "player-location";
    locationLabel.title = location;
    locationLabel.textContent = location;
    const cash = document.createElement("span");
    cash.textContent = `$${p.cash}`;
    div.append(identity, locationLabel, cash);
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
        t.innerHTML = '<i class="googly-eye"></i><i class="googly-eye"></i>';
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
  const vacationSpace = document.querySelector("#space-20 .name");
  if (vacationSpace) vacationSpace.textContent = state.freeParkingPot ? `Vacation\n$${state.freeParkingPot} on hold` : "Vacation";

  // Manage properties dropdown (only my properties)
  const select = document.getElementById("myPropsSelect");
  select.innerHTML = "";
  const propertyList = document.getElementById("ownedPropertyList");
  propertyList.replaceChildren();
  document.getElementById("propertyLedgerTitle").textContent = `My properties (${me?.properties.length || 0})`;
  if (me) {
    me.properties.forEach(id => {
      const space = BOARD[id];
      const owned = state.ownership[id];
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${space.name}${owned.mortgaged ? " (mortgaged)" : ""}${owned.houses ? ` [${owned.houses}h]` : ""}${owned.hotel ? " [hotel]" : ""}`;
      select.appendChild(opt);

      const row = document.createElement("div");
      row.className = "owned-property-row";
      const marker = document.createElement("span");
      marker.className = "owned-property-marker";
      marker.style.background = GROUP_COLORS[space.group] || (space.type === "railroad" ? "#707b92" : "#63b8df");
      const name = document.createElement("span");
      name.className = "owned-property-name";
      name.textContent = space.name;
      const detail = document.createElement("span");
      detail.className = "owned-property-detail";
      detail.textContent = owned.hotel ? "HOTEL" : owned.houses ? `${owned.houses}H` : owned.mortgaged ? "MORTGAGED" : "";
      row.append(marker, name, detail);
      propertyList.appendChild(row);
    });
  }

  // Log
  const logEl = document.getElementById("log");
  logEl.replaceChildren(...state.log.map(entry => {
    const message = document.createElement("div");
    message.textContent = entry.msg;
    return message;
  }));
  logEl.scrollTop = logEl.scrollHeight;
}
