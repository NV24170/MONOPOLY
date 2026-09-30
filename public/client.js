import { S, $, me, playerById, isHost, act, toast, sessionId, savedName, saveName, money } from "/store.js";
import { hydrateIcons, icon, displayName, esc, TILE_ART } from "/ui-assets.js";
import { sfx } from "/sfx.js";
import {
  buildBoard, syncTile, setVacationPot, pulseTile, shakeTile, ensureToken, pruneTokens, layoutTokens,
  tileCenter, tokenPoint, hop, fly, releaseToken, thud, vanish, floatText, splash, coinFlight, confetti,
  clientCenterOfTile, boardCenter, sleep, skipMotion, trackEyes,
} from "/board-view.js";
import {
  renderTurnBar, renderPlayers, renderSettings, renderAppearance, renderMine, renderRules, openProperty,
  openTradeDialog, renderTradeProps, sendTrade, renderTradePanel, renderCenter, addFeed, renderLog,
} from "/panels.js";

hydrateIcons();
trackEyes();

// Decorative icons at the bottom of the landing page.
{
  const floor = document.querySelector(".landing-floor");
  const items = [[8, "chest", 0], [20, "plane", 1], [33, "bolt", 0], [46, "water", 1], [59, "question", 0], [72, "ring", 1], [86, "chest", 1]];
  floor.innerHTML = items.map(([left, art, dim], i) => `<span class="floor-item${dim ? " dim" : ""}" style="left:${left}%;animation-delay:${i * -0.8}s">${TILE_ART[art]}</span>`).join("");
}

// =====================================================================
// Boot
// =====================================================================
const boardReady = fetch("/board-data").then((r) => r.json()).then((data) => {
  S.BOARD = data;
  buildBoard(data, openProperty);
});

let diceAnimator = null; // null until the 3D dice are ready (or if WebGL is unavailable)
let diceStarted = false;
async function initDice() {
  if (diceStarted) return;
  diceStarted = true;
  try {
    const { createDiceAnimator } = await import("/dice3d.js");
    diceAnimator = createDiceAnimator($("dice3d")) || null;
  } catch {
    diceAnimator = null;
  }
  if (!diceAnimator) $("dice3d").classList.add("dice-fallback");
}

const socket = io();
S.socket = socket;

let joinedOnce = false;
let pendingRoom = null;
{
  const match = location.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,20})\/?$/);
  const param = new URLSearchParams(location.search).get("room");
  pendingRoom = (match && match[1]) || param || null;
  if (pendingRoom) pendingRoom = pendingRoom.toLowerCase();
}

// =====================================================================
// Landing
// =====================================================================
const nameInput = $("nameInput");
nameInput.value = savedName();
if (pendingRoom) $("playLabel").textContent = "Join game";

function currentName() {
  const name = nameInput.value.trim() || "Player";
  saveName(name);
  return name;
}

function randomRoomId() {
  return Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(2, 8).padEnd(6, "x");
}

function joinRoom(roomId, extra = {}) {
  return new Promise((resolve) => {
    socket.emit("join_room", { roomId, playerName: currentName(), sessionId: sessionId(), ...extra }, (res) => {
      if (res?.error) { $("landingError").textContent = res.error; sfx.error(); resolve(false); return; }
      S.myId = res.playerId;
      S.roomId = res.roomId;
      joinedOnce = true;
      try { sessionStorage.setItem("ccp:room", res.roomId); } catch { /* ignore */ }
      history.replaceState(null, "", `/room/${res.roomId}`);
      $("landing").classList.add("hidden");
      $("app").classList.remove("hidden");
      initDice();
      if (S.state) renderAll();
      resolve(true);
    });
  });
}

$("playBtn").onclick = async () => {
  sfx.unlock(); sfx.click();
  $("landingError").textContent = "";
  if (pendingRoom) { await joinRoom(pendingRoom, { mustExist: true }); return; }
  let target = null;
  try {
    const rooms = await (await fetch("/rooms")).json();
    rooms.sort((a, b) => b.players - a.players);
    target = rooms[0]?.id || null;
  } catch { /* fall back to a fresh room */ }
  await joinRoom(target || randomRoomId(), { isPrivate: false });
};
$("createPrivateBtn").onclick = async () => {
  sfx.unlock(); sfx.click();
  $("landingError").textContent = "";
  await joinRoom(randomRoomId(), { isPrivate: true });
};
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("playBtn").click(); });

async function loadRooms() {
  const list = $("roomsList");
  list.innerHTML = '<p class="empty">Loading…</p>';
  try {
    const rooms = await (await fetch("/rooms")).json();
    list.innerHTML = rooms.length
      ? rooms.map((r) => `<div class="room-row"><span class="room-id">${esc(r.id)}</span><span class="room-meta">${esc(r.host)}'s room · ${r.players}/${r.max} players</span><button class="btn-primary sm" type="button" data-room="${esc(r.id)}">Join</button></div>`).join("")
      : '<p class="empty">No open rooms right now. Create a private game or press Play to start a public one.</p>';
    list.querySelectorAll("[data-room]").forEach((b) => {
      b.onclick = async () => { $("roomsDialog").close(); await joinRoom(b.dataset.room, { mustExist: true }); };
    });
  } catch {
    list.innerHTML = '<p class="empty">Could not load rooms.</p>';
  }
}
$("allRoomsBtn").onclick = () => { sfx.click(); $("roomsDialog").showModal(); loadRooms(); };
$("roomsCloseBtn").onclick = () => $("roomsDialog").close();
$("roomsRefreshBtn").onclick = loadRooms;

// Reconnect: same tab, same session id -> same seat.
socket.on("connect", () => {
  if (!joinedOnce || !S.roomId) return;
  socket.emit("join_room", { roomId: S.roomId, playerName: savedName() || "Player", sessionId: sessionId(), mustExist: true }, (res) => {
    if (res?.error) { toast("Connection lost — this room is no longer available", "error"); setTimeout(() => { location.href = "/"; }, 1800); return; }
    S.myId = res.playerId;
    toast("Reconnected");
  });
});
socket.on("disconnect", () => { if (joinedOnce) toast("Connection lost. Trying to reconnect…", "error"); });

// Refresh inside a room: rejoin automatically.
(async () => {
  let remembered = null;
  try { remembered = sessionStorage.getItem("ccp:room"); } catch { /* ignore */ }
  if (pendingRoom && remembered === pendingRoom && savedName()) {
    await joinRoom(pendingRoom, { mustExist: true });
  }
})();

// =====================================================================
// Sound buttons
// =====================================================================
function paintSound() {
  ["soundBtn", "soundBtnLanding"].forEach((id) => { $(id).innerHTML = icon(sfx.enabled ? "volume" : "mute"); });
}
paintSound();
["soundBtn", "soundBtnLanding"].forEach((id) => {
  $(id).onclick = () => { sfx.unlock(); sfx.setEnabled(!sfx.enabled); paintSound(); };
});

// =====================================================================
// In-room controls
// =====================================================================
$("copyBtn").onclick = async () => {
  const link = $("shareLink").value;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    $("shareLink").select();
    document.execCommand?.("copy");
  }
  $("copyLabel").textContent = "Copied!";
  sfx.click();
  setTimeout(() => { $("copyLabel").textContent = "Copy"; }, 1600);
};
$("shareLink").addEventListener("focus", (e) => e.target.select());

function leaveRoom() {
  socket.emit("leave_room", {}, () => {
    try { sessionStorage.removeItem("ccp:room"); } catch { /* ignore */ }
    location.href = "/";
  });
}
$("leaveBtn").onclick = () => { if (confirm("Leave this room? Your seat will be released.")) leaveRoom(); };
$("gameOverLeave").onclick = leaveRoom;

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat_message", { text });
  input.value = "";
});
socket.on("chat_message", ({ name, color, playerId, text }) => {
  addFeed({ kind: "chat", name, color: color || "#fff", text });
  if (playerId !== S.myId) sfx.message();
});

$("joinGameBtn").onclick = () => {
  sfx.click();
  act("choose_appearance", { color: S.pendingColor }, (res) => {
    $("appearanceError").textContent = res?.error || "";
    if (!res?.error) { S.pickingAppearance = false; renderAppearance(); }
  });
};

const lock = (id) => { $(id).disabled = true; };
$("startBtn").onclick = () => { sfx.click(); lock("startBtn"); act("start_game", {}, () => { $("startBtn").disabled = false; }); };
$("rollBtn").onclick = () => { sfx.unlock(); lock("rollBtn"); act("roll_dice", {}, (r) => { if (r?.error) $("rollBtn").disabled = false; }); };
$("buyBtn").onclick = () => { lock("buyBtn"); act("buy_property"); };
$("declineBtn").onclick = () => { lock("declineBtn"); act("decline_buy"); };
$("endBtn").onclick = () => { sfx.click(); lock("endBtn"); act("end_turn"); };
$("payJailBtn").onclick = () => { lock("payJailBtn"); act("pay_jail_fine"); };
$("jailCardBtn").onclick = () => { lock("jailCardBtn"); act("use_jail_card"); };

$("bidBtn").onclick = () => {
  const amount = parseInt($("bidInput").value, 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) { toast("Enter a whole-dollar bid", "error"); return; }
  act("auction_bid", { amount });
};
$("bidInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("bidBtn").click(); });
$("auctionPassBtn").onclick = () => act("auction_pass");
document.querySelectorAll(".auction .chip").forEach((chip) => {
  chip.onclick = () => {
    const a = S.state?.pendingAuction;
    if (!a) return;
    act("auction_bid", { amount: a.highestBid + Number(chip.dataset.inc) });
  };
});

$("tradeOpenBtn").onclick = () => { sfx.click(); openTradeDialog(); };
$("tradeCloseBtn").onclick = () => $("tradeDialog").close();
$("tradeCancelBtn").onclick = () => $("tradeDialog").close();
$("tradeTarget").addEventListener("change", renderTradeProps);
$("tradeSendBtn").onclick = sendTrade;
$("tradeAccept").onclick = () => act("respond_trade", { accept: true });
$("tradeReject").onclick = () => act("respond_trade", { accept: false });
$("tradeCancel").onclick = () => act("cancel_trade");

document.querySelectorAll("dialog.modal").forEach((dlg) => {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
});

// =====================================================================
// State + animation queue
// =====================================================================
const queue = [];
let running = false;
let lastSeq = null;
let stateChain = Promise.resolve();

socket.on("state", (state) => {
  stateChain = stateChain.then(() => boardReady).then(() => onState(state)).catch((error) => console.error(error));
});

function ingestEvents(state) {
  const events = state.events || [];
  if (lastSeq === null) {
    // First state after (re)joining: never replay history.
    lastSeq = events.length ? events[events.length - 1].seq : 0;
    return;
  }
  for (const e of events) {
    if (e.seq <= lastSeq) continue;
    lastSeq = e.seq;
    queue.push(e);
    if (["buy", "build", "sell", "mortgage"].includes(e.type)) S.hold.add(e.spaceId);
  }
}

function onState(state) {
  S.state = state;
  S.roomId = state.roomId;
  ingestEvents(state);
  if (queue.length || running) S.busy = true;
  renderAll();
  if (queue.length && !running) runQueue();
}

async function runQueue() {
  running = true;
  S.busy = true;
  while (queue.length) {
    const e = queue.shift();
    try { await play(e); } catch (error) { console.error("animation failed", e, error); }
  }
  running = false;
  S.busy = false;
  S.hold.clear();
  renderAll();
}

function refreshTile(id) {
  const o = S.state.ownership[id];
  syncTile(id, o, o ? playerById(o.ownerId)?.color : null);
}

function renderTokens(animate = true) {
  const s = S.state;
  if (!s.started) { pruneTokens(new Set()); return; }
  const ids = new Set(s.players.map((p) => p.id));
  pruneTokens(ids);
  s.players.forEach((p) => {
    ensureToken(p);
    if (!S.busy || !S.visual.has(p.id)) S.visual.set(p.id, p.position);
  });
  layoutTokens(s.players, S.visual, animate);
}

let firstRender = true;
function renderAll() {
  const s = S.state;
  if (!s) return;
  $("shareLink").value = `${location.origin}/room/${s.roomId}`;
  document.title = s.started ? "CCP Monopoly · in game" : `CCP Monopoly · ${s.roomId}`;

  S.BOARD.forEach((sp) => {
    if (sp.type !== "property" && sp.type !== "railroad" && sp.type !== "utility") return;
    if (!S.hold.has(sp.id)) refreshTile(sp.id);
  });
  setVacationPot(s.rules.vacationCash ? s.freeParkingPot : 0);

  renderTokens(!firstRender);
  firstRender = false;

  $("settingsPanel").classList.toggle("hidden", s.started);
  $("minePanel").classList.toggle("hidden", !s.started);
  $("rulesPanel").classList.toggle("hidden", !s.started);
  $("app").classList.toggle("in-game", s.started);

  renderTurnBar();
  renderPlayers();
  if (!s.started) renderSettings();
  else { renderMine(); renderRules(); }
  renderAppearance();
  renderTradePanel();
  renderCenter();
  ["rollBtn", "endBtn", "declineBtn", "payJailBtn", "jailCardBtn"].forEach((id) => { if (!$(id).classList.contains("hidden")) $(id).disabled = false; });
  renderLog();

  if (s.lastRoll && !$("diceSum").textContent && s.started) {
    $("diceSum").textContent = `${s.lastRoll[0]} + ${s.lastRoll[1]} = ${s.lastRoll[0] + s.lastRoll[1]}`;
  }
  if (s.phase === "gameover" && !S.busy) showGameOver();
}

function showGameOver() {
  const s = S.state;
  if (!$("gameOver").classList.contains("hidden")) return;
  const winner = s.players.find((p) => !p.bankrupt);
  $("gameOverTitle").textContent = winner ? `${winner.id === S.myId ? "You win!" : `${winner.name} wins!`}` : "Game over";
  $("gameOverSub").textContent = winner ? `${winner.name} finished with ${money(winner.cash)} and ${winner.properties.length} properties.` : "Everyone left the table.";
  $("gameOver").classList.remove("hidden");
}

// =====================================================================
// Animations
// =====================================================================
const nameOf = (id) => playerById(id)?.name || "Someone";
const colorOf = (id) => playerById(id)?.color || "#fff";
const anchor = (pid, fallbackTile = 0) => tokenPoint(pid) || tileCenter(fallbackTile);

async function play(e) {
  if (skipMotion()) { instant(e); return; }
  const s = S.state;
  switch (e.type) {
    case "start": {
      splash("Let's go!", "#b9a2ff", "Roll the dice to begin");
      sfx.turn();
      await sleep(1100);
      break;
    }
    case "turn": {
      if (e.again) splash("Roll again!", colorOf(e.playerId), nameOf(e.playerId));
      else splash(e.playerId === S.myId ? "Your turn" : `${nameOf(e.playerId)}'s turn`, colorOf(e.playerId));
      if (e.playerId === S.myId) sfx.turn();
      await sleep(e.again ? 650 : 750);
      break;
    }
    case "roll": {
      $("diceSum").textContent = "";
      $("diceSum").classList.remove("double");
      if (diceAnimator) diceAnimator.rollTo(e.dice);
      else {
        const box = $("dice3d");
        box.textContent = e.dice.map((v) => String.fromCodePoint(0x267f + v)).join(" ");
        box.classList.remove("tumble");
        void box.offsetWidth;
        box.classList.add("tumble");
      }
      sfx.dice();
      await sleep(diceAnimator ? 1050 : 500);
      const [a, b] = e.dice;
      $("diceSum").textContent = `${a} + ${b} = ${a + b}`;
      $("diceSum").classList.toggle("double", !!e.double);
      if (e.double) { splash("Doubles!", "#ffd34e"); sfx.gain(); }
      await sleep(380);
      break;
    }
    case "move": await animateMove(e); break;
    case "card": {
      const layer = $("cardLayer");
      const chest = e.deck === "community_chest";
      layer.className = "card-layer";
      layer.innerHTML = `<div class="game-card ${chest ? "chest" : "chance"}"><div class="game-card-inner"><div class="face back"></div><div class="face front"><small>${chest ? "Treasure" : "Surprise"}</small><p>${esc(e.text)}</p></div></div></div>`;
      sfx.card();
      await sleep(2700);
      layer.classList.add("leave");
      await sleep(360);
      layer.className = "card-layer hidden";
      layer.innerHTML = "";
      break;
    }
    case "rent": {
      const from = anchor(e.fromId, S.BOARD[e.spaceId] ? e.spaceId : 0);
      const to = anchor(e.toId, e.spaceId);
      shakeTile(e.spaceId);
      sfx.coin();
      floatText(from.x, from.y - 10, `-${money(e.amount)}`, "loss");
      const flight = coinFlight(from, to, Math.min(12, 4 + Math.round(e.amount / 60)));
      await sleep(650);
      floatText(to.x, to.y - 10, `+${money(e.amount)}`, "gain");
      sfx.gain();
      await flight;
      await sleep(250);
      break;
    }
    case "tax": {
      const at = anchor(e.playerId, e.spaceId);
      shakeTile(e.spaceId);
      floatText(at.x, at.y - 10, `-${money(e.amount)}`, "loss");
      sfx.loss();
      await sleep(950);
      break;
    }
    case "cash": {
      const at = anchor(e.playerId);
      floatText(at.x, at.y - 10, `${e.amount > 0 ? "+" : "-"}${money(Math.abs(e.amount))}`, e.amount > 0 ? "gain" : "loss");
      (e.amount > 0 ? sfx.gain : sfx.loss)();
      await sleep(650);
      break;
    }
    case "vacation": {
      const at = anchor(e.playerId, 20);
      splash("Vacation cash!", "#7ef0a5", money(e.amount));
      floatText(at.x, at.y - 10, `+${money(e.amount)}`, "gain");
      sfx.gain();
      confetti(...Object.values(clientCenterOfTile(20)), 30);
      await sleep(1100);
      break;
    }
    case "buy": {
      S.hold.delete(e.spaceId);
      const color = colorOf(e.playerId);
      refreshTile(e.spaceId);
      pulseTile(e.spaceId, color);
      const at = anchor(e.playerId, e.spaceId);
      floatText(at.x, at.y - 10, `-${money(e.price)}`, "loss");
      splash(displayName(S.BOARD[e.spaceId]), color, e.auction ? `won by ${nameOf(e.playerId)}` : `bought by ${nameOf(e.playerId)}`);
      const c = clientCenterOfTile(e.spaceId);
      confetti(c.x, c.y, 26, [color, "#ffffff", "#f8c845"]);
      sfx.buy();
      await sleep(1000);
      break;
    }
    case "build": {
      S.hold.delete(e.spaceId);
      refreshTile(e.spaceId);
      pulseTile(e.spaceId, colorOf(e.playerId));
      const c = clientCenterOfTile(e.spaceId);
      confetti(c.x, c.y, e.hotel ? 30 : 12, ["#ff5c7a", "#ffffff", "#ffd34e"], 0.7);
      if (e.hotel) splash("Hotel built!", colorOf(e.playerId), displayName(S.BOARD[e.spaceId]));
      sfx.build();
      await sleep(e.hotel ? 900 : 480);
      break;
    }
    case "sell": {
      S.hold.delete(e.spaceId);
      refreshTile(e.spaceId);
      shakeTile(e.spaceId);
      const at = tileCenter(e.spaceId);
      floatText(at.x, at.y, "Sold", "gain");
      sfx.coin();
      await sleep(450);
      break;
    }
    case "mortgage": {
      S.hold.delete(e.spaceId);
      refreshTile(e.spaceId);
      shakeTile(e.spaceId);
      sfx.click();
      await sleep(350);
      break;
    }
    case "jail": {
      thud(e.playerId);
      splash("Busted!", "#ff5c7a", `${nameOf(e.playerId)} goes to prison`);
      sfx.jail();
      await sleep(1250);
      break;
    }
    case "free": {
      splash("Free!", "#7ef0a5", `${nameOf(e.playerId)} leaves prison`);
      sfx.gain();
      await sleep(900);
      break;
    }
    case "trade": {
      splash("Trade completed", "#b9a2ff", `${nameOf(e.fromId)} ⇄ ${nameOf(e.toId)}`);
      sfx.gain();
      await sleep(1000);
      break;
    }
    case "bankrupt": {
      splash("Bankrupt!", "#ff5c7a", nameOf(e.playerId));
      sfx.bankrupt();
      await vanish(e.playerId);
      await sleep(500);
      break;
    }
    case "win": {
      sfx.win();
      const w = window.innerWidth;
      for (let i = 0; i < 6; i++) {
        setTimeout(() => confetti(w * (0.15 + Math.random() * 0.7), window.innerHeight * (0.2 + Math.random() * 0.3), 60), i * 260);
      }
      await sleep(1300);
      break;
    }
    default:
      break;
  }
}

async function animateMove(e) {
  const pid = e.playerId;
  const p = playerById(pid);
  if (!p) return;
  ensureToken(p);
  const forward = e.mode !== "back";
  if (e.mode === "jump" || e.from === e.to) {
    if (e.from !== e.to) { sfx.hop(0); await fly(pid, e.to, 800); }
  } else {
    const steps = forward ? (e.to - e.from + 40) % 40 : (e.from - e.to + 40) % 40;
    const dur = Math.max(95, Math.min(220, 2300 / Math.max(steps, 1)));
    let idx = e.from;
    for (let n = 0; n < steps; n++) {
      idx = forward ? (idx + 1) % 40 : (idx + 39) % 40;
      sfx.hop(n);
      await hop(pid, idx, dur);
      if (idx === 0 && e.passedGo) {
        const c = tileCenter(0);
        pulseTile(0, "#7ef0a5");
        floatText(c.x, c.y - 6, "+$200", "gain");
        sfx.gain();
      }
    }
  }
  S.visual.set(pid, e.to);
  releaseToken(pid);
  layoutTokens(S.state.players, S.visual, true);
  pulseTile(e.to, p.color);
  await sleep(220);
}

// Used when the tab is hidden: apply the result without any delays.
function instant(e) {
  if (e.type === "move") S.visual.set(e.playerId, e.to);
  if (["buy", "build", "sell", "mortgage"].includes(e.type)) { S.hold.delete(e.spaceId); refreshTile(e.spaceId); }
  if (e.type === "win") $("diceSum").textContent = "";
}

// Keep tokens correct when the layout changes size.
window.addEventListener("resize", () => { if (S.state?.started) layoutTokens(S.state.players, S.visual, false); });
