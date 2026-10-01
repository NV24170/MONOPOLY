const { BOARD, RAILROAD_RENT, CHANCE_CARDS, COMMUNITY_CHEST_CARDS } = require("./board");
const PLAYER_COLORS = ["#c1dd4b", "#f8c845", "#ff8741", "#d84a4c", "#54a3e3", "#5dd8df", "#15aa9a", "#69e153", "#aa7e68", "#db49ab", "#f56e97", "#7851dc"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // {id, name, socketId, position, cash, properties[], inJail, jailTurns, doublesCount, jailCards, bankrupt}
    this.ownership = {}; // spaceId -> { ownerId, houses, mortgaged }
    this.turnIndex = 0;
    this.started = false;
    this.phase = "waiting"; // waiting | preroll | moved | awaiting_buy | auction | jail | gameover
    this.log = [];
    this.chanceDeck = shuffle(CHANCE_CARDS);
    this.chestDeck = shuffle(COMMUNITY_CHEST_CARDS);
    this.lastRoll = null;
    this.rollSequence = 0;
    this.pendingAuction = null; // { spaceId, highestBid, highestBidder, order, currentBidderIdx, passed:Set }
    this.pendingTrade = null;
    this.pendingDebt = null;
    this.pendingDebtQueue = [];
    this.freeParkingPot = 0;
    this.hostId = null;
    this.events = []; // animation events for clients: { seq, type, ... }
    this.eventSeq = 0;
    this.logSeq = 0;
    this.settings = { maxPlayers: 4, isPrivate: false, allowBots: false, startingCash: 1500, randomOrder: false };
    this.rules = {
      auctionOnDecline: true,
      vacationCash: false,
      doubleRentOnMonopoly: true,
      rentFreeInJail: false,
      mortgage: true,
      evenBuild: true,
    };
  }

  emit(type, data = {}) {
    this.events.push({ seq: ++this.eventSeq, type, ...data });
    if (this.events.length > 80) this.events.shift();
  }

  // Defaults used when a room is created from the lobby (matches richup.io's defaults).
  applyRoomDefaults({ isPrivate = false } = {}) {
    this.settings.isPrivate = isPrivate;
    Object.assign(this.rules, {
      auctionOnDecline: false, vacationCash: false, doubleRentOnMonopoly: false,
      rentFreeInJail: false, mortgage: false, evenBuild: true,
    });
  }

  firstFreeColor() {
    const used = new Set(this.players.filter(p => !p.bankrupt).map(p => p.color));
    return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0];
  }

  addPlayer(id, name, socketId, opts = {}) {
    if (this.started) return { error: "Game already started" };
    if (this.players.length >= this.settings.maxPlayers) {
      // A bot gives up its seat to a human.
      const bot = this.players.find(p => p.bot);
      if (!bot || opts.bot) return { error: "Room full" };
      this.players = this.players.filter(p => p !== bot);
    }
    this.players.push({
      id, name, socketId,
      position: 0, cash: 1500, properties: [],
      color: this.firstFreeColor(), ready: !!opts.bot, bot: !!opts.bot, connected: true,
      inJail: false, jailTurns: 0, doublesCount: 0,
      jailCards: 0, bankrupt: false,
    });
    if (!this.hostId && !opts.bot) this.hostId = id;
    this.addLog(`${name} joined the room.`);
    return { ok: true };
  }

  humanPlayers() { return this.players.filter(p => !p.bot); }

  addBot() {
    const names = ["Ada", "Turing", "Grace", "Linus", "Hedy", "Ken", "Radia", "Dennis"];
    const taken = new Set(this.players.map(p => p.name));
    const name = "Bot " + (names.find(n => !taken.has("Bot " + n)) || this.players.length);
    const id = "bot-" + Math.random().toString(36).slice(2, 8);
    return this.addPlayer(id, name, null, { bot: true });
  }

  syncBots() {
    if (this.started) return;
    if (this.settings.allowBots) {
      while (this.players.length < this.settings.maxPlayers) {
        if (this.addBot().error) break;
      }
    } else {
      this.players = this.players.filter(p => !p.bot);
    }
  }

  updateSettings({ settings = {}, rules = {} } = {}) {
    if (this.started) return { error: "Settings cannot be changed after the game starts" };
    if (!settings || typeof settings !== "object" || !rules || typeof rules !== "object") return { error: "Settings are invalid" };
    const next = {};
    if ("maxPlayers" in settings) {
      const n = settings.maxPlayers;
      if (!Number.isInteger(n) || n < 2 || n > 8) return { error: "Max players must be between 2 and 8" };
      if (n < this.humanPlayers().length) return { error: "There are already more players in the room" };
      next.maxPlayers = n;
    }
    if ("startingCash" in settings) {
      if (![500, 1000, 1500, 2000, 2500, 3000].includes(settings.startingCash)) return { error: "Invalid starting cash" };
      next.startingCash = settings.startingCash;
    }
    for (const key of ["isPrivate", "allowBots", "randomOrder"]) {
      if (key in settings) {
        if (typeof settings[key] !== "boolean") return { error: "Settings are invalid" };
        next[key] = settings[key];
      }
    }
    const nextRules = {};
    for (const key of Object.keys(this.rules)) {
      if (key in rules && typeof rules[key] === "boolean") nextRules[key] = rules[key];
    }
    Object.assign(this.settings, next);
    Object.assign(this.rules, nextRules);
    if ("maxPlayers" in next || "allowBots" in next) {
      // Drop surplus bots if seats were removed, then refill/clear bots.
      while (this.players.length > this.settings.maxPlayers) {
        const bot = [...this.players].reverse().find(p => p.bot);
        if (!bot) break;
        this.players = this.players.filter(p => p !== bot);
      }
      this.syncBots();
    }
    return { ok: true };
  }

  removePlayer(id) {
    const p = this.getPlayer(id);
    if (!p || p.bankrupt) return;
    if (this.pendingTrade && [this.pendingTrade.fromId, this.pendingTrade.toId].includes(id)) {
      this.pendingTrade = null;
      this.addLog("A pending trade was cancelled because a player left.");
    }
    if (!p) return;
    if (this.started) {
      this.removeAuctionPlayer(id);
      const wasCurrent = this.currentPlayer()?.id === id;
      this.removePendingDebtsFor(id);
      this.declareBankruptcy(p, null);
      if (wasCurrent && this.phase !== "gameover" && !this.pendingDebt) {
        this.phase = "preroll";
        this.endTurn();
      }
    } else {
      this.players = this.players.filter(pl => pl.id !== id);
      if (this.hostId === id) this.hostId = this.humanPlayers()[0]?.id || null;
      if (this.settings.allowBots) this.syncBots();
    }
  }

  getPlayer(id) { return this.players.find(p => p.id === id); }
  currentPlayer() { return this.players[this.turnIndex]; }
  activePlayers() { return this.players.filter(p => !p.bankrupt); }

  chooseAppearance(playerId, color) {
    const player = this.getPlayer(playerId);
    if (this.started || !player || player.bankrupt) return { error: "Cannot choose an appearance now" };
    if (!PLAYER_COLORS.includes(color)) return { error: "Invalid player appearance" };
    if (this.players.some(other => other.id !== playerId && !other.bankrupt && other.color === color)) {
      return { error: "That appearance is already taken" };
    }
    player.color = color;
    player.ready = true;
    this.addLog(`${player.name} joined the game.`);
    return { ok: true };
  }

  addLog(msg) {
    this.log.push({ id: ++this.logSeq, msg, t: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  start() {
    if (this.started) return { error: "Game already started" };
    if (this.players.length < 2) return { error: "Need at least 2 players" };
    if (this.players.some(player => !player.ready)) return { error: "Everyone must choose an appearance first" };
    this.started = true;
    this.phase = "preroll";
    if (this.settings.randomOrder) this.players = shuffle(this.players);
    this.players.forEach(player => { player.cash = this.settings.startingCash; });
    this.turnIndex = 0;
    this.addLog("Game started. " + this.currentPlayer().name + "'s turn.");
    this.emit("start");
    this.emit("turn", { playerId: this.currentPlayer().id });
    return { ok: true };
  }

  // ---- Turn / dice ----
  // If the player whose turn it is just went bankrupt, the turn must move on;
  // otherwise the table would wait forever for someone who can no longer act.
  settleTurn() {
    if (!this.started || this.phase === "gameover" || this.pendingAuction || this.pendingDebt) return;
    const current = this.currentPlayer();
    if (current && current.bankrupt) {
      this.phase = "postroll";
      this.endTurn();
    }
  }

  rollDice(playerId) {
    const result = this.performRoll(playerId);
    this.settleTurn();
    return result;
  }

  performRoll(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) return { error: "Not your turn" };
    if (this.phase !== "preroll" && this.phase !== "jail") return { error: "Cannot roll now" };

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const isDouble = d1 === d2;
    this.lastRoll = [d1, d2];
    this.rollSequence++;
    this.emit("roll", { playerId, dice: [d1, d2], double: isDouble });

    if (player.inJail) {
      return this.handleJailRoll(player, d1, d2, isDouble);
    }

    if (isDouble) {
      player.doublesCount++;
      if (player.doublesCount === 3) {
        this.addLog(`${player.name} rolled 3 doubles in a row and goes to Jail!`);
        this.sendToJail(player);
        this.phase = "preroll";
        this.endTurn();
        return { ok: true, doubles: true, sentToJail: true, roll: [d1, d2] };
      }
    } else {
      player.doublesCount = 0;
    }

    this.movePlayer(player, d1 + d2);
    const result = this.resolveLanding(player);
    return { ok: true, roll: [d1, d2], isDouble, ...result };
  }

  handleJailRoll(player, d1, d2, isDouble) {
    if (isDouble) {
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(`${player.name} rolled doubles and is released from Jail.`);
      this.movePlayer(player, d1 + d2);
      const result = this.resolveLanding(player);
      return { ok: true, roll: [d1, d2], releasedFromJail: true, ...result };
    } else {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        player.cash -= 50;
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(`${player.name} failed 3 jail rolls, paid $50, and is released.`);
        this.movePlayer(player, d1 + d2);
        const result = this.resolveLanding(player);
        this.checkBankruptOnDebt(player, 50, null);
        return { ok: true, roll: [d1, d2], paidToLeaveJail: true, ...result };
      }
      this.addLog(`${player.name} stayed in Jail (roll ${d1},${d2}).`);
      this.phase = "preroll";
      this.endTurn();
      return { ok: true, roll: [d1, d2], staysInJail: true };
    }
  }

  payJailFine(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || !player.inJail) return { error: "Cannot pay fine now" };
    if (player.cash < 50) {
      player.cash -= 50;
      this.checkBankruptOnDebt(player, 50, null);
      const debt = [this.pendingDebt, ...this.pendingDebtQueue].find(item => item?.playerId === playerId);
      if (debt) debt.continuation = "leave_jail";
      return { ok: true, pendingDebt: true };
    }
    player.cash -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} paid $50 to leave Jail.`);
    this.emit("free", { playerId, how: "fine" });
    this.phase = "preroll";
    return { ok: true };
  }

  useJailCard(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || !player.inJail || player.jailCards < 1) {
      return { error: "Cannot use jail card" };
    }
    player.jailCards--;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} used a Get Out of Jail Free card.`);
    this.emit("free", { playerId, how: "card" });
    this.phase = "preroll";
    return { ok: true };
  }

  movePlayer(player, spaces) {
    const prev = player.position;
    player.position = (player.position + spaces) % 40;
    const passedGo = player.position < prev;
    this.emit("move", { playerId: player.id, from: prev, to: player.position, mode: "walk", passedGo });
    if (passedGo) {
      player.cash += 200;
      this.addLog(`${player.name} passed START and collected $200.`);
    }
  }

  sendToJail(player) {
    const from = player.position;
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
    this.emit("move", { playerId: player.id, from, to: 10, mode: "jump", passedGo: false });
    this.emit("jail", { playerId: player.id });
  }

  resolveLanding(player) {
    const space = BOARD[player.position];
    this.addLog(`${player.name} landed on ${space.name}.`);

    switch (space.type) {
      case "go_to_jail":
        this.sendToJail(player);
        this.phase = "preroll";
        this.endTurn();
        return { space, event: "sent_to_jail" };

      case "tax": {
        player.cash -= space.amount;
        this.freeParkingPot += space.amount;
        this.addLog(`${player.name} paid $${space.amount} tax.`);
        this.emit("tax", { playerId: player.id, amount: space.amount, spaceId: space.id });
        this.phase = "postroll";
        const bankrupt = this.checkBankruptOnDebt(player, space.amount, null);
        return { space, event: "tax_paid", bankrupt };
      }

      case "chance":
      case "community_chest": {
        const turnIndex = this.turnIndex;
        const card = this.drawCard(space.type, player);
        const outcome = this.applyCard(player, card);
        if (this.pendingDebt) {
          this.pendingDebt.resumePhase = "postroll";
          this.pendingDebtQueue.forEach(debt => { debt.resumePhase = "postroll"; });
          this.phase = "debt";
        } else if (outcome.type === "goto_jail" && this.turnIndex === turnIndex) {
          this.phase = "preroll";
          this.endTurn();
        } else if (this.turnIndex === turnIndex && this.phase !== "awaiting_buy" && this.phase !== "gameover") {
          this.phase = "postroll";
        }
        return { space, event: "card", card, outcome };
      }

      case "free_parking":
        if (this.rules.vacationCash && this.freeParkingPot > 0) {
          player.cash += this.freeParkingPot;
          this.addLog(`${player.name} collected $${this.freeParkingPot} from Vacation.`);
          this.emit("vacation", { playerId: player.id, amount: this.freeParkingPot });
          this.freeParkingPot = 0;
        }
        this.phase = "postroll";
        return { space, event: "free_parking" };

      case "jail":
        this.phase = "postroll";
        return { space, event: "just_visiting" };

      case "go":
        this.phase = "postroll";
        return { space, event: "go" };

      case "property":
      case "railroad":
      case "utility": {
        const owned = this.ownership[space.id];
        if (!owned) {
          this.phase = "awaiting_buy";
          return { space, event: "unowned" };
        }
        if (owned.ownerId === player.id) {
          this.phase = "postroll";
          return { space, event: "own_property" };
        }
        if (owned.mortgaged) {
          this.phase = "postroll";
          return { space, event: "mortgaged_no_rent" };
        }
        const rent = this.calculateRent(space, owned, this.lastRoll);
        const owner = this.getPlayer(owned.ownerId);
        player.cash -= rent;
        owner.cash += rent;
        this.addLog(`${player.name} paid $${rent} rent to ${owner.name}.`);
        this.emit("rent", { fromId: player.id, toId: owner.id, amount: rent, spaceId: space.id });
        this.phase = "postroll";
        const bankrupt = this.checkBankruptOnDebt(player, rent, owner);
        return { space, event: "rent_paid", rent, owner: owner.id, bankrupt };
      }

      default:
        this.phase = "postroll";
        return { space, event: "none" };
    }
  }

  calculateRent(space, owned, lastRoll) {
    const ownerPlayer = this.getPlayer(owned.ownerId);
    if (this.rules.rentFreeInJail && ownerPlayer?.inJail) return 0;
    if (space.type === "railroad") {
      const owner = this.getPlayer(owned.ownerId);
      const count = owner.properties.filter(id => BOARD[id].type === "railroad").length;
      return RAILROAD_RENT[count - 1] || RAILROAD_RENT[0];
    }
    if (space.type === "utility") {
      const owner = this.getPlayer(owned.ownerId);
      const count = owner.properties.filter(id => BOARD[id].type === "utility").length;
      const roll = (lastRoll ? lastRoll[0] + lastRoll[1] : 7);
      return count >= 2 ? roll * 10 : roll * 4;
    }
    // property
    if (owned.hotel) return space.rent[5];
    const houses = owned.houses;
    if (houses > 0) return space.rent[houses];
    // base rent; double if owner has full color group and 0 houses
    const owner = this.getPlayer(owned.ownerId);
    const groupSpaces = BOARD.filter(s => s.group === space.group);
    const ownsAll = groupSpaces.every(s => this.ownership[s.id] && this.ownership[s.id].ownerId === owner.id);
    if (ownsAll && this.rules.doubleRentOnMonopoly) return space.rent[0] * 2;
    return space.rent[0];
  }

  drawCard(type, player = null) {
    const deck = type === "chance" ? this.chanceDeck : this.chestDeck;
    const card = deck.shift();
    deck.push(card); // recycle to bottom
    this.emit("card", { playerId: player?.id || null, deck: type, text: card.text });
    return card;
  }

  applyCard(player, card) {
    switch (card.action) {
      case "collect":
        player.cash += card.amount;
        this.emit("cash", { playerId: player.id, amount: card.amount });
        return { type: "collect", amount: card.amount };
      case "pay":
        player.cash -= card.amount;
        this.emit("cash", { playerId: player.id, amount: -card.amount });
        this.checkBankruptOnDebt(player, card.amount, null);
        return { type: "pay", amount: card.amount };
      case "collect_each": {
        let total = 0;
        for (const other of this.activePlayers()) {
          if (other.id === player.id) continue;
          other.cash -= card.amount;
          player.cash += card.amount;
          total += card.amount;
          this.emit("cash", { playerId: other.id, amount: -card.amount });
          this.checkBankruptOnDebt(other, card.amount, player);
        }
        if (total) this.emit("cash", { playerId: player.id, amount: total });
        return { type: "collect_each", amount: card.amount };
      }
      case "pay_each": {
        let total = 0;
        for (const other of this.activePlayers()) {
          if (other.id === player.id) continue;
          player.cash -= card.amount;
          other.cash += card.amount;
          total += card.amount;
          this.emit("cash", { playerId: other.id, amount: card.amount });
          this.checkBankruptOnDebt(player, card.amount, other);
          if (player.bankrupt) break;
        }
        if (total) this.emit("cash", { playerId: player.id, amount: -total });
        return { type: "pay_each", amount: card.amount };
      }
      case "jail_free":
        player.jailCards++;
        return { type: "jail_free" };
      case "goto_jail":
        this.sendToJail(player);
        return { type: "goto_jail" };
      case "goto": {
        const prev = player.position;
        player.position = card.target;
        const collected = card.collectGo && (card.target < prev || card.target === 0);
        this.emit("move", { playerId: player.id, from: prev, to: card.target, mode: prev === card.target ? "jump" : "walk", passedGo: !!collected });
        if (collected) player.cash += 200;
        const landing = this.resolveLanding(player);
        return { type: "goto", target: card.target, landing };
      }
      case "goto_nearest": {
        const candidates = BOARD.filter(s => s.type === card.spaceType).map(s => s.id);
        let target = candidates.find(id => id > player.position);
        if (target === undefined) target = candidates[0];
        const prev = player.position;
        player.position = target;
        this.emit("move", { playerId: player.id, from: prev, to: target, mode: "walk", passedGo: target < prev });
        if (target < prev) player.cash += 200;
        // special: if unowned, buy price normal; if owned, rent x multiplier of dice
        const space = BOARD[target];
        const owned = this.ownership[target];
        if (owned && owned.ownerId !== player.id && !owned.mortgaged) {
          const roll = this.lastRoll ? this.lastRoll[0] + this.lastRoll[1] : 7;
          const rent = card.spaceType === "utility"
            ? roll * card.multiplier
            : this.calculateRent(space, owned, this.lastRoll) * card.multiplier;
          const owner = this.getPlayer(owned.ownerId);
          player.cash -= rent;
          owner.cash += rent;
          this.addLog(`${player.name} paid $${rent} rent to ${owner.name}.`);
          this.emit("rent", { fromId: player.id, toId: owner.id, amount: rent, spaceId: target });
          this.checkBankruptOnDebt(player, rent, owner);
          return { type: "goto_nearest", target, rentPaid: rent };
        }
        const landing = !owned ? { space, event: "unowned" } : null;
        if (landing) this.phase = "awaiting_buy";
        return { type: "goto_nearest", target, landing };
      }
      case "move_relative": {
        const prev = player.position;
        player.position = (prev + card.amount + 40) % 40;
        this.emit("move", { playerId: player.id, from: prev, to: player.position, mode: card.amount < 0 ? "back" : "walk", passedGo: false });
        const landing = this.resolveLanding(player);
        return { type: "move_relative", landing };
      }
      case "repairs": {
        let total = 0;
        player.properties.forEach(id => {
          const o = this.ownership[id];
          if (o.hotel) total += card.hotel;
          else total += (o.houses || 0) * card.house;
        });
        player.cash -= total;
        if (total) this.emit("cash", { playerId: player.id, amount: -total });
        this.checkBankruptOnDebt(player, total, null);
        return { type: "repairs", amount: total };
      }
      default:
        return { type: "unknown" };
    }
  }

  // ---- Buying / Auction ----
  buyProperty(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || this.phase !== "awaiting_buy") return { error: "Cannot buy now" };
    const space = BOARD[player.position];
    if (player.cash < space.price) return { error: "Not enough cash" };
    player.cash -= space.price;
    player.properties.push(space.id);
    this.ownership[space.id] = { ownerId: player.id, houses: 0, hotel: false, mortgaged: false };
    this.addLog(`${player.name} bought ${space.name} for $${space.price}.`);
    this.emit("buy", { playerId: player.id, spaceId: space.id, price: space.price });
    this.phase = "postroll";
    return { ok: true, space };
  }

  declineBuy(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || this.phase !== "awaiting_buy") return { error: "Cannot decline now" };
    const space = BOARD[player.position];
    if (this.rules.auctionOnDecline) {
      this.startAuction(space.id);
      return { ok: true, auctionStarted: true, space };
    }
    this.phase = "postroll";
    return { ok: true, space };
  }

  startAuction(spaceId) {
    const order = this.activePlayers().map(p => p.id);
    this.pendingAuction = {
      spaceId, highestBid: 0, highestBidder: null,
      order, currentBidderIdx: 0, passed: new Set(),
    };
    this.phase = "auction";
    this.addLog(`Auction started for ${BOARD[spaceId].name}.`);
  }

  auctionBid(playerId, amount) {
    const a = this.pendingAuction;
    if (!a) return { error: "No auction in progress" };
    const bidderId = a.order[a.currentBidderIdx];
    if (bidderId !== playerId) return { error: "Not your turn to bid" };
    const player = this.getPlayer(playerId);
    if (!Number.isSafeInteger(amount) || amount <= a.highestBid || amount > player.cash) return { error: "Invalid bid" };
    a.highestBid = amount;
    a.highestBidder = playerId;
    this.advanceAuction();
    return { ok: true };
  }

  auctionPass(playerId) {
    const a = this.pendingAuction;
    if (!a) return { error: "No auction in progress" };
    const bidderId = a.order[a.currentBidderIdx];
    if (bidderId !== playerId) return { error: "Not your turn to bid" };
    a.passed.add(playerId);
    this.advanceAuction();
    return { ok: true };
  }

  advanceAuction() {
    const a = this.pendingAuction;
    const remaining = a.order.filter(id => !a.passed.has(id));
    if (remaining.length === 0 || (remaining.length === 1 && a.highestBidder)) {
      this.finishAuction();
      return;
    }
    if (remaining.length === 1) {
      a.currentBidderIdx = a.order.indexOf(remaining[0]);
      return;
    }
    do {
      a.currentBidderIdx = (a.currentBidderIdx + 1) % a.order.length;
    } while (a.passed.has(a.order[a.currentBidderIdx]));
  }

  removeAuctionPlayer(playerId) {
    const auction = this.pendingAuction;
    if (!auction || !auction.order.includes(playerId)) return;
    const removedIndex = auction.order.indexOf(playerId);
    const wasCurrentBidder = auction.order[auction.currentBidderIdx] === playerId;
    auction.passed.add(playerId);
    if (auction.highestBidder === playerId) {
      auction.highestBid = 0;
      auction.highestBidder = null;
    }
    const remaining = auction.order.filter(id => !auction.passed.has(id));
    if (remaining.length === 0 || (remaining.length === 1 && auction.highestBidder)) {
      this.finishAuction();
      return;
    }
    if (wasCurrentBidder && remaining.length) {
      for (let offset = 1; offset <= auction.order.length; offset++) {
        const nextIndex = (removedIndex + offset) % auction.order.length;
        if (!auction.passed.has(auction.order[nextIndex])) {
          auction.currentBidderIdx = nextIndex;
          break;
        }
      }
    }
  }

  finishAuction() {
    const a = this.pendingAuction;
    const space = BOARD[a.spaceId];
    if (a.highestBidder) {
      const winner = this.getPlayer(a.highestBidder);
      winner.cash -= a.highestBid;
      winner.properties.push(space.id);
      this.ownership[space.id] = { ownerId: winner.id, houses: 0, hotel: false, mortgaged: false };
      this.addLog(`${winner.name} won the auction for ${space.name} at $${a.highestBid}.`);
      this.emit("buy", { playerId: winner.id, spaceId: space.id, price: a.highestBid, auction: true });
    } else {
      this.addLog(`No bids — ${space.name} remains unowned.`);
    }
    this.pendingAuction = null;
    this.phase = "postroll";
  }

  // ---- Building ----
  buildHouse(playerId, spaceId) {
    const player = this.getPlayer(playerId);
    const space = BOARD[spaceId];
    const owned = this.ownership[spaceId];
    if (!player || !space || space.type !== "property") return { error: "Can only build on properties" };
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    if (owned.mortgaged) return { error: "Property is mortgaged" };
    const groupSpaces = BOARD.filter(s => s.group === space.group);
    const ownsAll = groupSpaces.every(s => this.ownership[s.id] && this.ownership[s.id].ownerId === playerId);
    if (!ownsAll) return { error: "You need the full color group" };
    if (owned.hotel) return { error: "Already has a hotel" };
    const buildingLevel = property => property.hotel ? 5 : property.houses;
    const minHouses = Math.min(...groupSpaces.map(s => buildingLevel(this.ownership[s.id])));
    if (this.rules.evenBuild && buildingLevel(owned) > minHouses) return { error: "Must build evenly across the group" };
    if (player.cash < space.houseCost) return { error: "Not enough cash" };
    player.cash -= space.houseCost;
    if (owned.houses === 4) {
      owned.houses = 0;
      owned.hotel = true;
      this.addLog(`${player.name} built a hotel on ${space.name}.`);
    } else {
      owned.houses++;
      this.addLog(`${player.name} built a house on ${space.name} (${owned.houses}).`);
    }
    this.emit("build", { playerId, spaceId, houses: owned.houses, hotel: owned.hotel });
    return { ok: true };
  }

  sellHouse(playerId, spaceId) {
    const player = this.getPlayer(playerId);
    const space = BOARD[spaceId];
    const owned = this.ownership[spaceId];
    if (!player || !space || space.type !== "property") return { error: "Can only sell buildings on properties" };
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    const groupSpaces = BOARD.filter(s => s.group === space.group);
    if (owned.hotel) {
      const levelsAfterSale = groupSpaces.map(s => s.id === spaceId ? 4 : this.ownership[s.id].hotel ? 5 : this.ownership[s.id].houses);
      if (this.rules.evenBuild && Math.max(...levelsAfterSale) - Math.min(...levelsAfterSale) > 1) return { error: "Must sell evenly across the group" };
      owned.hotel = false;
      owned.houses = 4;
      player.cash += Math.floor(space.houseCost / 2);
      this.addLog(`${player.name} sold the hotel on ${space.name}.`);
      this.emit("sell", { playerId, spaceId, houses: owned.houses, hotel: false });
      this.resolveDebtIfCovered(player);
      return { ok: true };
    }
    if (owned.houses === 0) return { error: "No buildings to sell" };
    const maxOthers = Math.max(...groupSpaces.filter(s => s.id !== spaceId).map(s => this.ownership[s.id].hotel ? 5 : this.ownership[s.id].houses));
    if (this.rules.evenBuild && owned.houses < maxOthers) return { error: "Must sell evenly across the group" };
    const levelsAfterSale = groupSpaces.map(s => s.id === spaceId ? owned.houses - 1 : this.ownership[s.id].hotel ? 5 : this.ownership[s.id].houses);
    if (this.rules.evenBuild && Math.max(...levelsAfterSale) - Math.min(...levelsAfterSale) > 1) return { error: "Must sell evenly across the group" };
    owned.houses--;
    player.cash += Math.floor(space.houseCost / 2);
    this.addLog(`${player.name} sold a house on ${space.name}.`);
    this.emit("sell", { playerId, spaceId, houses: owned.houses, hotel: false });
    this.resolveDebtIfCovered(player);
    return { ok: true };
  }

  sellProperty(playerId, spaceId) {
    const player = this.getPlayer(playerId);
    const space = BOARD[spaceId];
    const owned = this.ownership[spaceId];
    if (!player || !space || !owned || owned.ownerId !== playerId) return { error: "You don't own this property" };
    if (this.pendingDebt?.playerId !== playerId) return { error: "You can only sell properties while resolving a debt" };
    if (owned.mortgaged) return { error: "This property is already mortgaged" };
    if (space.group && BOARD.some(s => s.group === space.group && (this.ownership[s.id]?.houses > 0 || this.ownership[s.id]?.hotel))) {
      return { error: "Sell all buildings in the color group first" };
    }
    const proceeds = space.mortgage || Math.floor(space.price / 2);
    player.cash += proceeds;
    player.properties = player.properties.filter(id => id !== spaceId);
    delete this.ownership[spaceId];
    this.addLog(`${player.name} sold ${space.name} back to the bank for $${proceeds}.`);
    this.emit("sell", { playerId, spaceId, proceeds, deed: true });
    this.resolveDebtIfCovered(player);
    return { ok: true, proceeds };
  }

  mortgageProperty(playerId, spaceId) {
    const owned = this.ownership[spaceId];
    const space = BOARD[spaceId];
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    if (!this.rules.mortgage) return { error: "Mortgages are turned off in this game" };
    if (space.type === "property" && BOARD.some(s => s.group === space.group && (this.ownership[s.id]?.houses > 0 || this.ownership[s.id]?.hotel))) {
      return { error: "Sell all buildings in the color group first" };
    }
    if (owned.mortgaged) return { error: "Already mortgaged" };
    owned.mortgaged = true;
    this.getPlayer(playerId).cash += space.mortgage;
    this.addLog(`${this.getPlayer(playerId).name} mortgaged ${space.name}.`);
    this.emit("mortgage", { playerId, spaceId, mortgaged: true });
    this.resolveDebtIfCovered(this.getPlayer(playerId));
    return { ok: true };
  }

  unmortgageProperty(playerId, spaceId) {
    const owned = this.ownership[spaceId];
    const space = BOARD[spaceId];
    const player = this.getPlayer(playerId);
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    if (!this.rules.mortgage) return { error: "Mortgages are turned off in this game" };
    if (!owned.mortgaged) return { error: "Not mortgaged" };
    const cost = Math.ceil(space.mortgage * 1.1);
    if (player.cash < cost) return { error: "Not enough cash" };
    player.cash -= cost;
    owned.mortgaged = false;
    this.addLog(`${player.name} unmortgaged ${space.name} for $${cost}.`);
    this.emit("mortgage", { playerId, spaceId, mortgaged: false });
    return { ok: true };
  }

  // ---- Trading ----
  validateTrade(fromId, toId, offer) {
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    if (!from || !to || fromId === toId || from.bankrupt || to.bankrupt) return { error: "Choose another active player" };
    if (!offer || typeof offer !== "object") return { error: "Trade offer is invalid" };

    const fromCash = offer.fromCash ?? 0;
    const toCash = offer.toCash ?? 0;
    const fromProps = offer.fromProps ?? [];
    const toProps = offer.toProps ?? [];
    if (!Number.isSafeInteger(fromCash) || !Number.isSafeInteger(toCash) || fromCash < 0 || toCash < 0) {
      return { error: "Cash amounts must be whole dollars" };
    }
    if (!Array.isArray(fromProps) || !Array.isArray(toProps)) return { error: "Properties must be selected from the list" };
    if (new Set(fromProps).size !== fromProps.length || new Set(toProps).size !== toProps.length) return { error: "A property can only be offered once" };
    if (fromProps.some(id => toProps.includes(id))) return { error: "The same property cannot be offered by both players" };
    if (!fromCash && !toCash && !fromProps.length && !toProps.length) return { error: "Add cash or property to the offer" };
    if (from.cash < fromCash || to.cash < toCash) return { error: "One player no longer has enough cash" };

    for (const [playerId, propertyIds] of [[fromId, fromProps], [toId, toProps]]) {
      for (const id of propertyIds) {
        if (!Number.isInteger(id) || !BOARD[id] || this.ownership[id]?.ownerId !== playerId) {
          return { error: "A selected property is no longer owned by that player" };
        }
        const property = this.ownership[id];
        if (property.houses || property.hotel) return { error: "Sell buildings before trading properties" };
        const group = BOARD[id].group;
        if (group && BOARD.some(space => space.group === group && this.ownership[space.id]?.ownerId === playerId && (this.ownership[space.id].houses || this.ownership[space.id].hotel))) {
          return { error: "Sell all buildings in a color group before trading its properties" };
        }
      }
    }
    return { offer: { fromCash, toCash, fromProps: [...fromProps], toProps: [...toProps] }, from, to };
  }

  proposeTrade(fromId, toId, offer) {
    if (!this.started) return { error: "Start the game before trading" };
    if (this.pendingTrade) return { error: "Another trade is already awaiting a response" };
    const checked = this.validateTrade(fromId, toId, offer);
    if (checked.error) return { error: checked.error };
    this.pendingTrade = { fromId, toId, offer: checked.offer, createdAt: Date.now() };
    this.addLog(`${checked.from.name} sent a trade offer to ${checked.to.name}.`);
    return { ok: true };
  }

  respondTrade(playerId, accept) {
    const pending = this.pendingTrade;
    if (!pending || pending.toId !== playerId) return { error: "There is no trade offer for you" };
    if (!accept) {
      this.pendingTrade = null;
      this.addLog(`${this.getPlayer(playerId).name} declined the trade offer.`);
      return { ok: true, accepted: false };
    }

    const checked = this.validateTrade(pending.fromId, pending.toId, pending.offer);
    if (checked.error) {
      this.pendingTrade = null;
      this.addLog("A trade expired because its cash or property changed.");
      return { error: checked.error };
    }
    const { from, to } = checked;
    const { fromCash, toCash, fromProps, toProps } = checked.offer;
    from.cash += toCash - fromCash;
    to.cash += fromCash - toCash;
    fromProps.forEach(id => {
      this.ownership[id].ownerId = to.id;
      from.properties = from.properties.filter(propertyId => propertyId !== id);
      to.properties.push(id);
    });
    toProps.forEach(id => {
      this.ownership[id].ownerId = from.id;
      to.properties = to.properties.filter(propertyId => propertyId !== id);
      from.properties.push(id);
    });
    this.pendingTrade = null;
    this.resolveDebtIfCovered(from);
    this.resolveDebtIfCovered(to);
    this.addLog(`${from.name} and ${to.name} completed a trade.`);
    this.emit("trade", { fromId: from.id, toId: to.id });
    return { ok: true, accepted: true };
  }

  cancelTrade(playerId) {
    if (!this.pendingTrade || this.pendingTrade.fromId !== playerId) return { error: "You have no trade offer to cancel" };
    this.pendingTrade = null;
    this.addLog(`${this.getPlayer(playerId).name} cancelled the trade offer.`);
    return { ok: true };
  }

  // ---- Bankruptcy ----
  checkBankruptOnDebt(player, amount, creditor) {
    if (player.cash >= 0) return false;
    const queued = [this.pendingDebt, ...this.pendingDebtQueue].find(debt => debt?.playerId === player.id);
    if (queued) {
      queued.amount += amount;
      if (!queued.creditorId && creditor) queued.creditorId = creditor.id;
      return true;
    }
    const debt = {
      playerId: player.id,
      amount,
      creditorId: creditor?.id || null,
      resumePhase: this.phase === "debt" ? "postroll" : this.phase,
    };
    if (!this.pendingDebt) {
      this.pendingDebt = debt;
      this.phase = "debt";
    } else {
      this.pendingDebtQueue.push(debt);
    }
    this.addLog(`${player.name} is short $${Math.abs(player.cash)} and must raise cash or declare bankruptcy.`);
    return true;
  }

  resolveDebtIfCovered(player) {
    if (this.pendingDebt?.playerId === player?.id && player.cash >= 0) {
      return this.resolvePendingDebt(player.id);
    }
    return { ok: true };
  }

  resolvePendingDebt(playerId) {
    let debt = this.pendingDebt;
    const player = this.getPlayer(playerId);
    if (!debt || debt.playerId !== playerId || !player) return { error: "You have no debt to resolve" };
    if (player.cash < 0) return { error: `You still need $${Math.abs(player.cash)} to pay this debt` };
    this.addLog(`${player.name} raised enough cash to pay the debt.`);
    this.completeDebtContinuation(debt);
    while ((this.pendingDebt = this.pendingDebtQueue.shift() || null)) {
      const nextPlayer = this.getPlayer(this.pendingDebt.playerId);
      if (!nextPlayer || nextPlayer.cash < 0) break;
      this.addLog(`${nextPlayer.name} already has enough cash to pay the debt.`);
      debt = this.pendingDebt;
      this.completeDebtContinuation(debt);
    }
    if (this.pendingDebt) this.phase = "debt";
    else this.phase = debt.resumePhase === "debt" ? "postroll" : debt.resumePhase;
    this.settleTurn();
    return { ok: true };
  }

  completeDebtContinuation(debt) {
    if (debt.continuation !== "leave_jail") return;
    const player = this.getPlayer(debt.playerId);
    if (!player || player.bankrupt) return;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} paid $50 to leave Jail.`);
    this.emit("free", { playerId: player.id, how: "fine" });
  }

  removePendingDebtsFor(playerId) {
    if (this.pendingDebt?.playerId === playerId) {
      const debt = this.pendingDebt;
      this.pendingDebt = this.pendingDebtQueue.shift() || null;
      if (this.pendingDebt) this.phase = "debt";
      else this.phase = debt.resumePhase === "debt" ? "postroll" : debt.resumePhase;
    }
    this.pendingDebtQueue = this.pendingDebtQueue.filter(debt => debt.playerId !== playerId);
  }

  declarePendingBankruptcy(playerId) {
    const debt = this.pendingDebt;
    const player = this.getPlayer(playerId);
    if (!debt || debt.playerId !== playerId || !player) return { error: "You have no debt to resolve" };
    this.pendingDebt = null;
    this.declareBankruptcy(player, this.getPlayer(debt.creditorId));
    if (this.phase !== "gameover") {
      this.pendingDebt = this.pendingDebtQueue.shift() || null;
      this.phase = this.pendingDebt ? "debt" : debt.resumePhase === "debt" ? "postroll" : debt.resumePhase;
      this.settleTurn();
    } else {
      this.pendingDebtQueue = [];
    }
    return { ok: true };
  }

  declareBankruptcy(player, creditor) {
    player.bankrupt = true;
    if (this.pendingTrade && [this.pendingTrade.fromId, this.pendingTrade.toId].includes(player.id)) {
      this.pendingTrade = null;
    }
    this.addLog(`${player.name} has gone bankrupt!`);
    this.emit("bankrupt", { playerId: player.id, creditorId: creditor?.id || null });
    if (creditor) {
      creditor.cash += Math.max(player.cash, 0);
      player.properties.forEach(id => {
        this.ownership[id].ownerId = creditor.id;
        creditor.properties.push(id);
      });
    } else {
      // bankrupt to the bank: properties return unowned
      player.properties.forEach(id => { delete this.ownership[id]; });
    }
    player.properties = [];
    player.cash = 0;

    const remaining = this.activePlayers();
    if (remaining.length <= 1) {
      this.phase = "gameover";
      this.addLog(remaining.length ? `${remaining[0].name} wins the game!` : "The game ended with no remaining players.");
      if (remaining.length) this.emit("win", { playerId: remaining[0].id });
    }
  }

  // ---- Turn management ----
  endTurn(playerId) {
    if (this.pendingDebt) return { error: "Resolve outstanding debt first" };
    if (playerId && this.phase !== "postroll") return { error: "Cannot end turn now" };
    if (playerId && (!this.currentPlayer() || this.currentPlayer().id !== playerId)) {
      return { error: "Not your turn" };
    }
    if (this.phase === "gameover") return { ok: true };
    const player = this.currentPlayer();
    if (player && !player.bankrupt && player.doublesCount > 0 && !player.inJail && this.phase === "postroll") {
      // rolled doubles (and not sent to jail) -> same player rolls again
      player.doublesCount = player.doublesCount; // keep count for 3-in-a-row tracking
      this.phase = "preroll";
      this.addLog(`${player.name} rolled doubles and goes again.`);
      this.emit("turn", { playerId: player.id, again: true });
      return { ok: true, goAgain: true };
    }
    if (player) player.doublesCount = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    } while (this.players[this.turnIndex].bankrupt);
    this.phase = "preroll";
    this.addLog(`${this.currentPlayer().name}'s turn.`);
    this.emit("turn", { playerId: this.currentPlayer().id });
    return { ok: true };
  }

  // ---- Serialization for clients ----
  getState() {
    return {
      roomId: this.roomId,
      started: this.started,
      phase: this.phase,
      pendingDebt: this.pendingDebt,
      players: this.players.map(p => ({
        id: p.id, name: p.name, position: p.position, cash: p.cash,
        color: p.color, ready: p.ready, bot: !!p.bot, connected: p.connected !== false,
        properties: p.properties, inJail: p.inJail, jailTurns: p.jailTurns,
        jailCards: p.jailCards, bankrupt: p.bankrupt,
      })),
      ownership: this.ownership,
      turnIndex: this.turnIndex,
      currentPlayerId: this.players[this.turnIndex] ? this.players[this.turnIndex].id : null,
      lastRoll: this.lastRoll,
      rollSequence: this.rollSequence,
      log: this.log.slice(-40),
      events: this.events.slice(-40),
      hostId: this.hostId,
      settings: this.settings,
      pendingAuction: this.pendingAuction
        ? { ...this.pendingAuction, passed: [...this.pendingAuction.passed] }
        : null,
      pendingTrade: this.pendingTrade ? {
        fromId: this.pendingTrade.fromId,
        toId: this.pendingTrade.toId,
        offer: this.pendingTrade.offer,
      } : null,
      freeParkingPot: this.freeParkingPot,
      rules: this.rules,
    };
  }
}

module.exports = Game;
