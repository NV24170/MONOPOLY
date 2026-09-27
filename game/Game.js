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
    this.freeParkingPot = 0;
    this.rules = {
      auctionOnDecline: true,
      vacationCash: false,
      doubleRentOnMonopoly: true,
      rentFreeInJail: false,
    };
  }

  addPlayer(id, name, socketId) {
    if (this.started) return { error: "Game already started" };
    if (this.players.length >= 6) return { error: "Room full" };
    this.players.push({
      id, name, socketId,
      position: 0, cash: 1500, properties: [],
      color: PLAYER_COLORS[this.players.length % PLAYER_COLORS.length], ready: false,
      inJail: false, jailTurns: 0, doublesCount: 0,
      jailCards: 0, bankrupt: false,
    });
    this.addLog(`${name} joined the game.`);
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
      this.declareBankruptcy(p, null);
    } else {
      this.players = this.players.filter(pl => pl.id !== id);
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
    this.log.push({ msg, t: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  start() {
    if (this.started) return { error: "Game already started" };
    if (this.players.length < 2) return { error: "Need at least 2 players" };
    if (this.players.some(player => !player.ready)) return { error: "Everyone must choose an appearance first" };
    this.started = true;
    this.phase = "preroll";
    this.turnIndex = 0;
    this.addLog("Game started. " + this.currentPlayer().name + "'s turn.");
    return { ok: true };
  }

  // ---- Turn / dice ----
  rollDice(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) return { error: "Not your turn" };
    if (this.phase !== "preroll" && this.phase !== "jail") return { error: "Cannot roll now" };

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const isDouble = d1 === d2;
    this.lastRoll = [d1, d2];
    this.rollSequence++;

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
    if (player.cash < 50) return { error: "Not enough cash to pay the fine" };
    player.cash -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} paid $50 to leave Jail.`);
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
    this.phase = "preroll";
    return { ok: true };
  }

  movePlayer(player, spaces) {
    const prev = player.position;
    player.position = (player.position + spaces) % 40;
    if (player.position < prev) {
      player.cash += 200;
      this.addLog(`${player.name} passed GO and collected $200.`);
    }
  }

  sendToJail(player) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
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
        this.phase = "postroll";
        const bankrupt = this.checkBankruptOnDebt(player, space.amount, null);
        return { space, event: "tax_paid", bankrupt };
      }

      case "chance":
      case "community_chest": {
        const turnIndex = this.turnIndex;
        const card = this.drawCard(space.type);
        const outcome = this.applyCard(player, card);
        if (outcome.type === "goto_jail" && this.turnIndex === turnIndex) {
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
          this.addLog(`${player.name} collected $${this.freeParkingPot} from Free Parking.`);
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

  drawCard(type) {
    const deck = type === "chance" ? this.chanceDeck : this.chestDeck;
    const card = deck.shift();
    deck.push(card); // recycle to bottom
    return card;
  }

  applyCard(player, card) {
    switch (card.action) {
      case "collect":
        player.cash += card.amount;
        return { type: "collect", amount: card.amount };
      case "pay":
        player.cash -= card.amount;
        this.checkBankruptOnDebt(player, card.amount, null);
        return { type: "pay", amount: card.amount };
      case "collect_each":
        for (const other of this.activePlayers()) {
          if (other.id === player.id) continue;
          other.cash -= card.amount;
          player.cash += card.amount;
          this.checkBankruptOnDebt(other, card.amount, player);
        }
        return { type: "collect_each", amount: card.amount };
      case "pay_each":
        for (const other of this.activePlayers()) {
          if (other.id === player.id) continue;
          player.cash -= card.amount;
          other.cash += card.amount;
          this.checkBankruptOnDebt(player, card.amount, other);
          if (player.bankrupt) break;
        }
        return { type: "pay_each", amount: card.amount };
      case "jail_free":
        player.jailCards++;
        return { type: "jail_free" };
      case "goto_jail":
        this.sendToJail(player);
        return { type: "goto_jail" };
      case "goto": {
        const prev = player.position;
        player.position = card.target;
        if (card.collectGo && (card.target < prev || card.target === 0)) player.cash += 200;
        const landing = this.resolveLanding(player);
        return { type: "goto", target: card.target, landing };
      }
      case "goto_nearest": {
        const candidates = BOARD.filter(s => s.type === card.spaceType).map(s => s.id);
        let target = candidates.find(id => id > player.position);
        if (target === undefined) target = candidates[0];
        const prev = player.position;
        player.position = target;
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
    if (buildingLevel(owned) > minHouses) return { error: "Must build evenly across the group" };
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
      if (Math.max(...levelsAfterSale) - Math.min(...levelsAfterSale) > 1) return { error: "Must sell evenly across the group" };
      owned.hotel = false;
      owned.houses = 4;
      player.cash += Math.floor(space.houseCost / 2);
      this.addLog(`${player.name} sold the hotel on ${space.name}.`);
      return { ok: true };
    }
    if (owned.houses === 0) return { error: "No buildings to sell" };
    const maxOthers = Math.max(...groupSpaces.filter(s => s.id !== spaceId).map(s => this.ownership[s.id].hotel ? 5 : this.ownership[s.id].houses));
    if (owned.houses < maxOthers) return { error: "Must sell evenly across the group" };
    const levelsAfterSale = groupSpaces.map(s => s.id === spaceId ? owned.houses - 1 : this.ownership[s.id].hotel ? 5 : this.ownership[s.id].houses);
    if (Math.max(...levelsAfterSale) - Math.min(...levelsAfterSale) > 1) return { error: "Must sell evenly across the group" };
    owned.houses--;
    player.cash += Math.floor(space.houseCost / 2);
    this.addLog(`${player.name} sold a house on ${space.name}.`);
    return { ok: true };
  }

  mortgageProperty(playerId, spaceId) {
    const owned = this.ownership[spaceId];
    const space = BOARD[spaceId];
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    if (space.type === "property" && BOARD.some(s => s.group === space.group && (this.ownership[s.id]?.houses > 0 || this.ownership[s.id]?.hotel))) {
      return { error: "Sell all buildings in the color group first" };
    }
    if (owned.mortgaged) return { error: "Already mortgaged" };
    owned.mortgaged = true;
    this.getPlayer(playerId).cash += space.mortgage;
    this.addLog(`${this.getPlayer(playerId).name} mortgaged ${space.name}.`);
    return { ok: true };
  }

  unmortgageProperty(playerId, spaceId) {
    const owned = this.ownership[spaceId];
    const space = BOARD[spaceId];
    const player = this.getPlayer(playerId);
    if (!owned || owned.ownerId !== playerId) return { error: "You don't own this" };
    if (!owned.mortgaged) return { error: "Not mortgaged" };
    const cost = Math.ceil(space.mortgage * 1.1);
    if (player.cash < cost) return { error: "Not enough cash" };
    player.cash -= cost;
    owned.mortgaged = false;
    this.addLog(`${player.name} unmortgaged ${space.name} for $${cost}.`);
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
    this.addLog(`${from.name} and ${to.name} completed a trade.`);
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
    // try raising cash via mortgages/selling houses is left to the player UI before this point;
    // if still negative, declare bankruptcy
    if (player.cash < 0) {
      this.declareBankruptcy(player, creditor);
      return true;
    }
    return false;
  }

  declareBankruptcy(player, creditor) {
    player.bankrupt = true;
    if (this.pendingTrade && [this.pendingTrade.fromId, this.pendingTrade.toId].includes(player.id)) {
      this.pendingTrade = null;
    }
    this.addLog(`${player.name} has gone bankrupt!`);
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
    }
  }

  // ---- Turn management ----
  endTurn(playerId) {
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
      return { ok: true, goAgain: true };
    }
    if (player) player.doublesCount = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    } while (this.players[this.turnIndex].bankrupt);
    this.phase = "preroll";
    this.addLog(`${this.currentPlayer().name}'s turn.`);
    return { ok: true };
  }

  // ---- Serialization for clients ----
  getState() {
    return {
      roomId: this.roomId,
      started: this.started,
      phase: this.phase,
      players: this.players.map(p => ({
        id: p.id, name: p.name, position: p.position, cash: p.cash,
        color: p.color, ready: p.ready,
        properties: p.properties, inJail: p.inJail, jailTurns: p.jailTurns,
        jailCards: p.jailCards, bankrupt: p.bankrupt,
      })),
      ownership: this.ownership,
      turnIndex: this.turnIndex,
      currentPlayerId: this.players[this.turnIndex] ? this.players[this.turnIndex].id : null,
      lastRoll: this.lastRoll,
      rollSequence: this.rollSequence,
      log: this.log.slice(-30),
      pendingAuction: this.pendingAuction,
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
