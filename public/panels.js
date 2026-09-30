import { S, $, me, playerById, isHost, isMyTurn, act, toast, tweenNumber, money } from "/store.js";
import { icon, hydrateIcons, esc, GROUP_TINT, GROUP_LABEL, PLAYER_COLORS, COLOR_NAMES, COUNTRY_FLAGS, flagSvg, displayName } from "/ui-assets.js";
import { sfx } from "/sfx.js";

const eyes = '<i class="eye"><b></b></i><i class="eye"><b></b></i>';
const blob = (color, extra = "") => `<span class="blob ${extra}" style="--c:${color}">${eyes}</span>`;

// ---------- Turn bar ----------
export function renderTurnBar() {
  const s = S.state;
  const el = $("turnBar");
  if (!s) return;
  if (!s.started) {
    el.className = "turn-bar waiting";
    el.textContent = "Waiting for players…";
    return;
  }
  const cur = playerById(s.currentPlayerId);
  if (s.phase === "gameover") {
    const winner = s.players.find((p) => !p.bankrupt);
    el.className = "turn-bar over";
    el.innerHTML = `${winner ? blob(winner.color, "sm") : ""}<span>${esc(winner ? winner.name : "Nobody")} wins!</span>`;
    return;
  }
  const mine = cur && cur.id === S.myId;
  const key = `${cur?.id}|${mine}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.className = `turn-bar ${mine ? "is-mine" : ""}`;
  el.style.setProperty("--c", cur?.color || "#7851dc");
  el.innerHTML = `${cur ? blob(cur.color, "sm") : ""}<span>${mine ? "Your turn" : `${esc(cur?.name || "?")}'s turn`}</span>`;
}

// ---------- Players ----------
export function renderPlayers() {
  const s = S.state;
  const host = $("players");
  $("playerCount").textContent = `${s.players.filter((p) => !p.bankrupt).length}/${s.settings.maxPlayers}`;
  const seen = new Set();
  s.players.forEach((p, index) => {
    seen.add(p.id);
    let row = host.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
    if (!row) {
      row = document.createElement("div");
      row.dataset.pid = p.id;
      row.innerHTML = '<span class="pl-avatar"></span><span class="pl-main"><span class="pl-name"></span><span class="pl-tags"></span></span><span class="pl-cash"></span>';
      host.appendChild(row);
      row.classList.add("enter");
      setTimeout(() => row.classList.remove("enter"), 500);
    }
    row.className = `player-row${p.id === s.currentPlayerId && s.started && !p.bankrupt ? " current" : ""}${p.bankrupt ? " bankrupt" : ""}${p.connected === false ? " offline" : ""}`;
    row.style.setProperty("--c", p.color);
    const avatar = row.querySelector(".pl-avatar");
    if (avatar.dataset.c !== p.color) { avatar.dataset.c = p.color; avatar.innerHTML = blob(p.color, "sm"); }
    row.querySelector(".pl-name").textContent = p.name;
    const tags = [];
    if (p.id === s.hostId) tags.push(`<span class="tag host" title="Host">${icon("crown")}</span>`);
    if (p.bot) tags.push(`<span class="tag" title="Bot">${icon("robot")}</span>`);
    if (p.id === S.myId) tags.push('<span class="tag you">You</span>');
    if (p.inJail && !p.bankrupt) tags.push(`<span class="tag jail" title="In prison">${icon("prison")}</span>`);
    if (p.jailCards > 0) tags.push(`<span class="tag card" title="Get out of prison free card">×${p.jailCards}</span>`);
    if (p.connected === false) tags.push(`<span class="tag off" title="Reconnecting">${icon("wifi")}</span>`);
    if (s.started && !p.bankrupt) tags.push(`<span class="tag props" title="Properties">${icon("home")}${p.properties.length}</span>`);
    if (p.bankrupt) tags.push('<span class="tag off">Bankrupt</span>');
    const tagHtml = tags.join("");
    const tagEl = row.querySelector(".pl-tags");
    if (tagEl.dataset.h !== tagHtml) { tagEl.dataset.h = tagHtml; tagEl.innerHTML = tagHtml; }
    const cashEl = row.querySelector(".pl-cash");
    cashEl.classList.toggle("hidden", !s.started);
    tweenNumber(cashEl, p.cash);
    row.style.order = String(index);
  });
  host.querySelectorAll("[data-pid]").forEach((row) => { if (!seen.has(row.dataset.pid)) row.remove(); });
}

// ---------- Settings (pre-game) ----------
const RULES = [
  { key: "doubleRentOnMonopoly", icon: "coins", title: "x2 rent on full-set properties", desc: "If a player owns a full property set, the base rent payment will be doubled" },
  { key: "vacationCash", icon: "palm", title: "Vacation cash", desc: "If a player lands on Vacation, all collected money from taxes and bank payments will be earned" },
  { key: "auctionOnDecline", icon: "hammer", title: "Auction", desc: "If someone skips purchasing the property landed on, it will be sold to the highest bidder" },
  { key: "rentFreeInJail", icon: "prison", title: "Don't collect rent while in prison", desc: "Rent will not be collected when landing on properties whose owners are in prison" },
  { key: "mortgage", icon: "bank", title: "Mortgage", desc: "Mortgage properties to earn 50% of their cost, but you won't get paid rent when players land on them" },
  { key: "evenBuild", icon: "stack", title: "Even build", desc: "Houses and hotels must be built up and sold off evenly within a property set" },
];

let settingsSig = "";
export function renderSettings() {
  const s = S.state;
  const panel = $("settingsPanel");
  const host = isHost();
  const player = me();
  const sig = JSON.stringify([s.settings, s.rules, host, s.players.map((p) => [p.id, p.name, p.color, p.ready, p.bot]), player?.ready]);
  if (sig === settingsSig) return;
  settingsSig = sig;
  const st = s.settings;
  const dis = host ? "" : "disabled";
  const toggle = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${dis}><span></span></label>`;
  panel.innerHTML = `
    <div class="me-row">
      ${player ? blob(player.color, "sm") : ""}
      <span class="me-name">${esc(player?.name || "")}</span>
      ${host ? `<span class="pill host">${icon("crown")}Host</span>` : ""}
      <button id="changeLookBtn" class="btn-ghost sm" type="button">${icon("palette")}Change appearance</button>
    </div>
    <h3 class="settings-title">Game settings</h3>
    <div class="setting"><span class="s-ico">${icon("users")}</span><span class="s-text"><b>Maximum players</b><small>How many players can join the game</small></span>
      <select id="setMax" class="select sm" ${dis}>${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === st.maxPlayers ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="setting"><span class="s-ico">${icon("key")}</span><span class="s-text"><b>Private room</b><small>Private rooms can be accessed using the room URL only</small></span>${toggle("setPrivate", st.isPrivate)}</div>
    <div class="setting"><span class="s-ico">${icon("robot")}</span><span class="s-text"><b>Allow bots to join <em class="beta">Beta</em></b><small>Bots will join the game based on availability</small></span>${toggle("setBots", st.allowBots)}</div>
    <div class="setting"><span class="s-ico">${icon("coins")}</span><span class="s-text"><b>Starting cash</b><small>How much money every player begins with</small></span>
      <select id="setCash" class="select sm" ${dis}>${[500, 1000, 1500, 2000, 2500, 3000].map((n) => `<option value="${n}" ${n === st.startingCash ? "selected" : ""}>$${n}</option>`).join("")}</select></div>
    <div class="setting"><span class="s-ico">${icon("shuffle")}</span><span class="s-text"><b>Randomize order</b><small>Shuffle the turn order when the game starts</small></span>${toggle("setOrder", st.randomOrder)}</div>
    <h3 class="settings-title">Gameplay rules</h3>
    ${RULES.map((r) => `<div class="setting"><span class="s-ico">${icon(r.icon)}</span><span class="s-text"><b>${r.title}</b><small>${r.desc}</small></span>${toggle("rule_" + r.key, s.rules[r.key])}</div>`).join("")}
  `;
  $("changeLookBtn").onclick = () => { S.pickingAppearance = true; renderAppearance(); };
  if (!host) return;
  const send = () => {
    act("update_settings", {
      settings: {
        maxPlayers: Number($("setMax").value),
        isPrivate: $("setPrivate").checked,
        allowBots: $("setBots").checked,
        startingCash: Number($("setCash").value),
        randomOrder: $("setOrder").checked,
      },
      rules: Object.fromEntries(RULES.map((r) => [r.key, $("rule_" + r.key).checked])),
    });
  };
  panel.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", () => { sfx.click(); send(); }));
}

// ---------- Appearance picker ----------
export function renderAppearance() {
  const s = S.state;
  const player = me();
  const overlay = $("appearance");
  const choosing = !!player && (!player.ready || S.pickingAppearance) && !s.started;
  overlay.classList.toggle("hidden", !choosing);
  $("board").classList.toggle("blurred", choosing);
  if (!choosing) return;
  const taken = new Set(s.players.filter((p) => p.id !== S.myId && !p.bankrupt).map((p) => p.color));
  if (!S.pendingColor || taken.has(S.pendingColor)) {
    S.pendingColor = taken.has(player.color) ? PLAYER_COLORS.find((c) => !taken.has(c)) : player.color;
  }
  const swatches = $("swatches");
  if (!swatches.children.length) {
    PLAYER_COLORS.forEach((color) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.dataset.color = color;
      b.style.setProperty("--c", color);
      b.setAttribute("aria-label", COLOR_NAMES[color]);
      b.innerHTML = eyes;
      b.onclick = () => { S.pendingColor = color; sfx.click(); renderAppearance(); };
      swatches.appendChild(b);
    });
  }
  swatches.querySelectorAll(".swatch").forEach((b) => {
    b.disabled = taken.has(b.dataset.color);
    b.classList.toggle("selected", b.dataset.color === S.pendingColor);
  });
  overlay.querySelector(".appearance-preview .blob").style.setProperty("--c", S.pendingColor);
}

// ---------- Player's property list ----------
let mineSig = "";
export function renderMine() {
  const s = S.state;
  const player = me();
  const list = $("mine");
  const props = player ? [...player.properties].sort((a, b) => a - b) : [];
  const sig = JSON.stringify([props.map((id) => [id, s.ownership[id]]), s.pendingTrade, s.players.length]);
  $("mineTitle").textContent = `Your properties${props.length ? ` (${props.length})` : ""}`;
  $("tradeOpenBtn").disabled = !!s.pendingTrade || s.players.filter((p) => !p.bankrupt && p.id !== S.myId).length === 0 || !player || player.bankrupt;
  if (sig === mineSig) return;
  mineSig = sig;
  if (!props.length) { list.innerHTML = '<p class="empty">Properties you buy will show up here.</p>'; return; }
  list.innerHTML = props.map((id) => {
    const sp = S.BOARD[id];
    const o = s.ownership[id];
    const tint = sp.group ? GROUP_TINT[sp.group] : sp.type === "railroad" ? "#8a94ad" : "#5fc9e6";
    const badge = o.hotel ? "Hotel" : o.houses ? `${o.houses} house${o.houses > 1 ? "s" : ""}` : "";
    return `<button type="button" class="mine-row ${o.mortgaged ? "mortgaged" : ""}" data-id="${id}" style="--tint:${tint}"><i class="dot"></i><span class="mr-name">${esc(displayName(sp))}</span><span class="mr-meta">${o.mortgaged ? "Mortgaged" : badge}</span></button>`;
  }).join("");
  list.querySelectorAll(".mine-row").forEach((b) => { b.onclick = () => openProperty(Number(b.dataset.id)); });
}

export function renderRules() {
  const s = S.state;
  $("ruleChips").innerHTML = RULES.filter((r) => s.rules[r.key]).map((r) => `<span class="rule-chip" title="${esc(r.desc)}">${icon(r.icon)}${esc(r.title.replace("Don't collect rent while in prison", "No rent in prison"))}</span>`).join("") || '<span class="empty">Standard rules</span>';
}

// ---------- Property dialog ----------
export function openProperty(id) {
  const s = S.state;
  const sp = S.BOARD[id];
  const dlg = $("propDialog");
  const o = s?.ownership[id];
  const owner = o ? playerById(o.ownerId) : null;
  const mineOwn = !!o && o.ownerId === S.myId;
  const canManage = mineOwn && s.started;
  const tint = sp.group ? GROUP_TINT[sp.group] : "#5b4aa0";
  let body = "";
  if (sp.type === "property") {
    const lvl = o ? (o.hotel ? 5 : o.houses) : -1;
    const labels = ["Rent", "1 house", "2 houses", "3 houses", "4 houses", "Hotel"];
    body = `<table class="rent-table">${sp.rent.map((r, i) => `<tr class="${i === lvl ? "on" : ""}"><td>${labels[i]}</td><td>${money(r)}</td></tr>`).join("")}</table>
      <div class="kv"><span>House cost</span><b>${money(sp.houseCost)}</b></div>`;
  } else if (sp.type === "railroad") {
    body = `<table class="rent-table">${["1 airport", "2 airports", "3 airports", "4 airports"].map((l, i) => `<tr><td>${l}</td><td>${money(25 * 2 ** i)}</td></tr>`).join("")}</table>`;
  } else if (sp.type === "utility") {
    body = '<table class="rent-table"><tr><td>One utility</td><td>4× dice</td></tr><tr><td>Both utilities</td><td>10× dice</td></tr></table>';
  } else if (sp.type === "tax") {
    body = `<div class="kv"><span>Pay the bank</span><b>${money(sp.amount)}</b></div>`;
  } else {
    body = '<p class="empty">Nothing to buy here.</p>';
  }
  if (sp.price) body += `<div class="kv"><span>Price</span><b>${money(sp.price)}</b></div>`;
  if (sp.mortgage) body += `<div class="kv"><span>Mortgage value</span><b>${money(sp.mortgage)}</b></div>`;
  const ownerLine = owner ? `<div class="owner-line">${blob(owner.color, "xs")}<span>Owned by <b>${esc(owner.name)}</b>${o.mortgaged ? " · mortgaged" : ""}</span></div>` : sp.price ? '<div class="owner-line free">Unowned</div>' : "";
  const flag = COUNTRY_FLAGS[sp.name];
  dlg.innerHTML = `
    <div class="prop-head" style="--tint:${tint}">
      ${flag ? `<span class="prop-flag">${flagSvg(flag)}</span>` : ""}
      <div><h2 id="propTitle">${esc(displayName(sp))}</h2>${sp.group ? `<small>${GROUP_LABEL[sp.group]}</small>` : ""}</div>
      <button class="icon-btn" type="button" id="propClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="prop-body">${ownerLine}${body}</div>
    ${canManage ? `<div class="prop-actions">
      ${sp.type === "property" ? '<button class="btn-primary sm" type="button" data-a="build_house">Build</button><button class="btn-soft sm" type="button" data-a="sell_house">Sell house</button>' : ""}
      ${s.rules.mortgage ? `<button class="btn-soft sm" type="button" data-a="${o.mortgaged ? "unmortgage_property" : "mortgage_property"}">${o.mortgaged ? `Unmortgage ${money(Math.ceil(sp.mortgage * 1.1))}` : `Mortgage +${money(sp.mortgage)}`}</button>` : ""}
    </div>` : ""}`;
  $("propClose").onclick = () => dlg.close();
  dlg.querySelectorAll("[data-a]").forEach((b) => {
    b.onclick = () => act(b.dataset.a, { spaceId: id }, (res) => { if (!res?.error) setTimeout(() => dlg.open && openProperty(id), 60); });
  });
  if (!dlg.open) dlg.showModal();
}

// ---------- Trade ----------
export function openTradeDialog() {
  const s = S.state;
  const player = me();
  if (!player || s.pendingTrade) return;
  const others = s.players.filter((p) => !p.bankrupt && p.id !== S.myId);
  const target = $("tradeTarget");
  target.innerHTML = others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  $("tradeFromCash").value = 0;
  $("tradeToCash").value = 0;
  $("tradeError").textContent = others.length ? "" : "No other active players are available.";
  $("tradeSendBtn").disabled = !others.length;
  renderTradeProps();
  $("tradeDialog").showModal();
}

export function renderTradeProps() {
  const s = S.state;
  const target = playerById($("tradeTarget").value);
  const draw = (containerId, p, name) => {
    const box = $(containerId);
    const list = (p?.properties || []).filter((id) => { const o = s.ownership[id]; return o && !o.houses && !o.hotel; }).sort((a, b) => a - b);
    box.innerHTML = list.length
      ? list.map((id) => `<label class="trade-prop"><input type="checkbox" name="${name}" value="${id}"><span class="dot" style="background:${S.BOARD[id].group ? GROUP_TINT[S.BOARD[id].group] : "#8a94ad"}"></span>${esc(displayName(S.BOARD[id]))}${s.ownership[id].mortgaged ? " · mortgaged" : ""}</label>`).join("")
      : '<p class="empty">No tradable properties</p>';
  };
  draw("tradeFromProps", me(), "from");
  draw("tradeToProps", target, "to");
}

export function sendTrade() {
  const offer = {
    fromCash: Number($("tradeFromCash").value || 0),
    toCash: Number($("tradeToCash").value || 0),
    fromProps: [...document.querySelectorAll("#tradeFromProps input:checked")].map((i) => Number(i.value)),
    toProps: [...document.querySelectorAll("#tradeToProps input:checked")].map((i) => Number(i.value)),
  };
  S.socket.emit("propose_trade", { toId: $("tradeTarget").value, offer }, (res) => {
    if (res?.error) { $("tradeError").textContent = res.error; sfx.error(); return; }
    $("tradeDialog").close();
    toast("Trade offer sent");
  });
}

export function renderTradePanel() {
  const s = S.state;
  const pending = s.pendingTrade;
  const involved = pending && (pending.fromId === S.myId || pending.toId === S.myId);
  const panel = $("tradePanel");
  panel.classList.toggle("hidden", !involved);
  if (!involved) return;
  const from = playerById(pending.fromId);
  const to = playerById(pending.toId);
  const names = (ids) => ids.map((id) => displayName(S.BOARD[id])).join(", ");
  const describe = (cash, ids) => [cash ? money(cash) : "", names(ids)].filter(Boolean).join(" + ") || "nothing";
  const incoming = pending.toId === S.myId;
  $("tradeTitle").textContent = incoming ? `Offer from ${from?.name}` : `Offer sent to ${to?.name}`;
  $("tradeText").innerHTML = `<b>${incoming ? "They give" : "You give"}:</b> ${esc(describe(pending.offer.fromCash, pending.offer.fromProps))}<br><b>${incoming ? "You give" : "You get"}:</b> ${esc(describe(pending.offer.toCash, pending.offer.toProps))}`;
  $("tradeAccept").classList.toggle("hidden", !incoming);
  $("tradeReject").classList.toggle("hidden", !incoming);
  $("tradeCancel").classList.toggle("hidden", incoming);
}

// ---------- Center: status, actions, auction ----------
export function renderCenter() {
  const s = S.state;
  const player = me();
  const host = isHost();
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  const mine = isMyTurn() && !S.busy && !player?.bankrupt;
  const phase = s.phase;
  const space = player ? S.BOARD[player.position] : null;

  if (!s.started) {
    const ready = s.players.filter((p) => p.ready).length;
    const canStart = s.players.length >= 2 && s.players.every((p) => p.ready);
    show("startBtn", host);
    $("startBtn").disabled = !canStart;
    show("rollBtn", false); show("buyBtn", false); show("declineBtn", false); show("endBtn", false); show("payJailBtn", false); show("jailCardBtn", false);
    show("auctionBox", false);
    $("centerMsg").textContent = `Joined room ${s.roomId}`;
    $("centerSub").textContent = s.players.length < 2
      ? "Invite a friend, or allow bots in the settings."
      : !canStart ? `${ready} of ${s.players.length} players are ready`
      : host ? "Everyone is ready." : "Waiting for the host to start…";
    $("diceSum").textContent = "";
    return;
  }

  $("centerMsg").textContent = "";
  show("startBtn", false);
  show("rollBtn", mine && phase === "preroll");
  show("buyBtn", mine && phase === "awaiting_buy");
  show("declineBtn", mine && phase === "awaiting_buy");
  show("endBtn", mine && phase === "postroll");
  show("payJailBtn", mine && phase === "preroll" && !!player?.inJail);
  show("jailCardBtn", mine && phase === "preroll" && !!player?.inJail && player.jailCards > 0);
  if (mine && phase === "awaiting_buy" && space) {
    $("buyBtn").textContent = `Buy ${displayName(space)} · ${money(space.price)}`;
    $("buyBtn").disabled = player.cash < space.price;
    $("declineBtn").textContent = s.rules.auctionOnDecline ? "Auction" : "Skip";
  }
  $("rollBtn").textContent = player?.inJail ? "Roll for doubles" : "Roll dice";
  const cur = playerById(s.currentPlayerId);
  if (phase === "gameover") $("centerSub").textContent = "";
  else if (S.busy) $("centerSub").textContent = "";
  else if (isMyTurn()) {
    $("centerSub").textContent = phase === "preroll" ? (player.inJail ? "You're in prison." : "It's your turn — roll the dice.")
      : phase === "awaiting_buy" ? `${displayName(space)} is for sale.`
      : phase === "postroll" ? "Build, trade, or end your turn." : "";
  } else $("centerSub").textContent = cur ? `Waiting for ${cur.name}…` : "";

  renderAuction();
}

export function renderAuction() {
  const s = S.state;
  const a = s.pendingAuction;
  const box = $("auctionBox");
  const open = !!a && s.phase === "auction" && !S.busy;
  box.classList.toggle("hidden", !open);
  if (!open) return;
  $("auctionName").textContent = displayName(S.BOARD[a.spaceId]);
  const amount = $("auctionAmount");
  tweenNumber(amount, a.highestBid, 350);
  const bidder = playerById(a.highestBidder);
  $("auctionWho").innerHTML = bidder ? `${blob(bidder.color, "xs")} ${esc(bidder.name)}` : "No bids yet";
  const turnId = a.order[a.currentBidderIdx];
  const turnP = playerById(turnId);
  const myTurn = turnId === S.myId;
  $("auctionTurn").textContent = myTurn ? "Your bid" : `Waiting for ${turnP?.name || "…"}`;
  $("bidBtn").disabled = !myTurn;
  $("auctionPassBtn").disabled = !myTurn;
  document.querySelectorAll(".auction .chip").forEach((c) => { c.disabled = !myTurn; });
  const input = $("bidInput");
  input.disabled = !myTurn;
  input.min = String(a.highestBid + 1);
  if (!input.dataset.for || input.dataset.for !== `${a.spaceId}:${a.highestBid}`) {
    input.dataset.for = `${a.spaceId}:${a.highestBid}`;
    input.value = String(a.highestBid + 10);
  }
}

// ---------- Chat feed ----------
export function addFeed({ kind = "chat", name = "", color = "#fff", text = "" }) {
  const feed = $("feed");
  $("feedEmpty")?.remove();
  const line = document.createElement("div");
  line.className = `feed-line ${kind}`;
  if (kind === "chat") {
    line.innerHTML = `<i class="dot" style="background:${color}"></i><span><b style="color:${color}">${esc(name)}</b> ${esc(text)}</span>`;
  } else {
    line.textContent = text;
  }
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  feed.appendChild(line);
  while (feed.children.length > 150) feed.firstElementChild.remove();
  if (nearBottom || kind === "chat") feed.scrollTop = feed.scrollHeight;
}

export function renderLog() {
  const s = S.state;
  const fresh = s.log.filter((entry) => entry.id > S.lastLogId);
  if (!fresh.length) return;
  S.lastLogId = fresh[fresh.length - 1].id;
  fresh.forEach((entry) => addFeed({ kind: "sys", text: entry.msg }));
}

hydrateIcons();
