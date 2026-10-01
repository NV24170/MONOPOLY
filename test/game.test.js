const test = require("node:test");
const assert = require("node:assert/strict");
const Game = require("../game/Game");
const { BOARD } = require("../game/board");

function createGame() {
  const game = new Game("test");
  game.addPlayer("p1", "Player One", "s1");
  game.addPlayer("p2", "Player Two", "s2");
  return game;
}

test("the city board matches the supplied clockwise location order", () => {
  assert.deepEqual(BOARD.map(space => space.name), [
    "START", "Salvador", "Treasure Chest", "Rio", "Income Tax", "TLV Airport",
    "Tel Aviv", "Surprise Box", "Haifa", "Jerusalem", "Passing by / In Prison",
    "Venice", "Electric Company", "Milan", "Rome", "MUX Airport", "Frankfurt",
    "Treasure Chest", "Munich", "Berlin", "Vacation", "Shenzhen", "Surprise Box",
    "Beijing", "Shanghai", "CDG Airport", "Lyon", "Toulouse", "Water Company", "Paris",
    "Go to Prison", "Liverpool", "Manchester", "Treasure Chest", "London", "JFK Airport",
    "Surprise Box", "San Francisco", "Luxury Tax", "New York",
  ]);
});

test("hotel rent uses the hotel rent tier", () => {
  const game = createGame();
  game.players[0].properties = [37, 39];
  game.ownership[37] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };
  game.ownership[39] = { ownerId: "p1", houses: 0, hotel: true, mortgaged: false };

  assert.equal(game.calculateRent(BOARD[39], game.ownership[39], [3, 4]), BOARD[39].rent[5]);
});

test("a mortgaged railroad still counts toward railroad rent multipliers", () => {
  const game = createGame();
  game.players[1].properties = [5, 15];
  game.ownership[5] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: false };
  game.ownership[15] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: true };

  assert.equal(game.calculateRent(BOARD[5], game.ownership[5], [3, 4]), 50);
});

test("a mortgaged utility still counts toward utility rent multipliers", () => {
  const game = createGame();
  game.players[1].properties = [12, 28];
  game.ownership[12] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: false };
  game.ownership[28] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: true };

  assert.equal(game.calculateRent(BOARD[12], game.ownership[12], [3, 4]), 70);
});

test("a property at four houses can be upgraded alongside a hotel", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 0, hotel: true, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 4, hotel: false, mortgaged: false };

  assert.deepEqual(game.buildHouse("p1", 3), { ok: true });
  assert.equal(game.ownership[3].hotel, true);
});

test("selling a hotel converts it to four houses without selling another house", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 0, hotel: true, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 4, hotel: false, mortgaged: false };

  assert.deepEqual(game.sellHouse("p1", 1), { ok: true });
  assert.equal(game.ownership[1].hotel, false);
  assert.equal(game.ownership[1].houses, 4);
  assert.equal(game.players[0].cash, 1525);
});

test("selling a hotel cannot leave its color group uneven", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 0, hotel: true, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 1, hotel: false, mortgaged: false };

  assert.match(game.sellHouse("p1", 1).error, /evenly/i);
  assert.equal(game.ownership[1].hotel, true);
  assert.equal(game.players[0].cash, 1500);
});

test("cannot mortgage a property while its color group has buildings", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 1, hotel: false, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };

  assert.match(game.mortgageProperty("p1", 3).error, /buildings/i);
  assert.equal(game.ownership[3].mortgaged, false);
});

test("selling a building from a railroad returns an error", () => {
  const game = createGame();
  game.players[0].properties = [5];
  game.ownership[5] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };

  assert.match(game.sellHouse("p1", 5).error, /properties/i);
});

test("building must stay even before upgrading a property to a hotel", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 4, hotel: false, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 3, hotel: false, mortgaged: false };

  assert.match(game.buildHouse("p1", 1).error, /evenly/i);
});

test("a player cannot restart a game that is already running", () => {
  const game = createGame();
  game.chooseAppearance("p1", "#c1dd4b");
  game.chooseAppearance("p2", "#f8c845");
  assert.deepEqual(game.start(), { ok: true });
  game.turnIndex = 1;

  assert.match(game.start().error, /already started/i);
  assert.equal(game.turnIndex, 1);
});

test("players cannot end a turn outside the post-roll phase", () => {
  const game = createGame();
  game.started = true;
  game.phase = "awaiting_buy";

  assert.match(game.endTurn("p1").error, /cannot end turn/i);
  assert.equal(game.turnIndex, 0);
});

test("advancing to GO awards $200 even when already on GO", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  const card = { action: "goto", target: 0, collectGo: true };

  game.applyCard(player, card);

  assert.equal(player.cash, 1700);
});

test("a nearest railroad card charges twice the railroad rent, not dice rent", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  const owner = game.getPlayer("p2");
  player.position = 36;
  owner.properties = [5, 15, 25, 35];
  for (const spaceId of owner.properties) {
    game.ownership[spaceId] = { ownerId: owner.id, houses: 0, hotel: false, mortgaged: false };
  }
  game.lastRoll = [3, 4];

  game.applyCard(player, { action: "goto_nearest", spaceType: "railroad", multiplier: 2 });

  assert.equal(player.cash, 1300);
  assert.equal(owner.cash, 1900);
});

test("a chance card landing on an unowned property leaves the player able to buy it", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.position = 7;
  game.chanceDeck = [{ action: "goto", target: 24, collectGo: true }];

  game.resolveLanding(player);

  assert.equal(player.position, 24);
  assert.equal(game.phase, "awaiting_buy");
});

test("card debt pauses the game while the player raises cash", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.position = 7;
  player.cash = 1;
  game.chanceDeck = [{ action: "pay", amount: 50 }];

  game.resolveLanding(player);

  assert.equal(game.phase, "debt");
  assert.equal(game.pendingDebt.playerId, "p1");
  assert.equal(game.getPlayer("p1").bankrupt, false);
});

test("a GO TO JAIL card ends the current player's turn", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.position = 7;
  game.chanceDeck = [{ action: "goto_jail" }];

  game.resolveLanding(player);

  assert.equal(player.inJail, true);
  assert.equal(game.turnIndex, 1);
});

test("the optional jail-rent rule suppresses rent owed to a jailed owner", () => {
  const game = createGame();
  game.players[1].inJail = true;
  game.players[1].properties = [1];
  game.ownership[1] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: false };
  game.rules.rentFreeInJail = true;

  assert.equal(game.calculateRent(BOARD[1], game.ownership[1], [1, 2]), 0);
});

test("pay-each cards allow the payer to raise cash before bankruptcy", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  game.addPlayer("p3", "Player Three", "s3");
  player.cash = 60;

  game.applyCard(player, { action: "pay_each", amount: 40 });

  assert.equal(player.bankrupt, false);
  assert.equal(player.cash, -20);
  assert.equal(game.pendingDebt.playerId, "p1");
  assert.equal(game.getPlayer("p3").cash, 1540);
});

test("collect-each cards pause for an insolvent payer to raise cash", () => {
  const game = createGame();
  const collector = game.getPlayer("p1");
  game.getPlayer("p2").cash = 20;

  game.applyCard(collector, { action: "collect_each", amount: 50 });

  assert.equal(game.getPlayer("p2").bankrupt, false);
  assert.equal(game.pendingDebt.playerId, "p2");
  assert.equal(collector.cash, 1550);
});

test("a player can sell an unbuilt deed to the bank to clear pending debt", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.properties = [5];
  player.cash = -40;
  game.ownership[5] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };
  game.started = true;
  game.phase = "postroll";
  game.checkBankruptOnDebt(player, 140, null);

  assert.deepEqual(game.sellProperty("p1", 5), { ok: true, proceeds: BOARD[5].mortgage });
  assert.equal(player.cash, 60);
  assert.equal(player.bankrupt, false);
  assert.equal(player.properties.includes(5), false);
  assert.equal(game.ownership[5], undefined);
  assert.equal(game.pendingDebt, null);
  assert.equal(game.phase, "postroll");
});

test("queued debts are resolved in order without losing the turn phase", () => {
  const game = createGame();
  const first = game.getPlayer("p1");
  const second = game.getPlayer("p2");
  first.cash = -20;
  second.cash = -30;
  first.properties = [5];
  second.properties = [15];
  game.ownership[5] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };
  game.ownership[15] = { ownerId: "p2", houses: 0, hotel: false, mortgaged: false };
  game.started = true;
  game.phase = "postroll";
  game.checkBankruptOnDebt(first, 1520, null);
  game.checkBankruptOnDebt(second, 1530, null);

  game.sellProperty("p1", 5);
  assert.equal(game.pendingDebt.playerId, "p2");
  assert.equal(game.phase, "debt");
  game.sellProperty("p2", 15);
  assert.equal(game.pendingDebt, null);
  assert.equal(game.phase, "postroll");
});

test("the debtor can declare bankruptcy after choosing not to sell assets", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.cash = -20;
  game.started = true;
  game.phase = "postroll";
  game.checkBankruptOnDebt(player, 1520, game.getPlayer("p2"));

  assert.deepEqual(game.declarePendingBankruptcy("p1"), { ok: true });
  assert.equal(player.bankrupt, true);
  assert.equal(game.pendingDebt, null);
});

test("auction bids must be whole-dollar amounts", () => {
  const game = createGame();
  game.startAuction(1);

  assert.match(game.auctionBid("p1", 1.5).error, /invalid bid/i);
});

test("the last auction bidder can still bid after every other player passes", () => {
  const game = createGame();
  game.startAuction(1);

  assert.deepEqual(game.auctionPass("p1"), { ok: true });
  assert.equal(game.pendingAuction.order[game.pendingAuction.currentBidderIdx], "p2");
  assert.deepEqual(game.auctionBid("p2", 60), { ok: true });
  assert.equal(game.ownership[1].ownerId, "p2");
});

test("a player who disconnects forfeits properties and can end the game", () => {
  const game = createGame();
  game.started = true;
  game.players[0].properties = [1];
  game.ownership[1] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };

  game.removePlayer("p1");

  assert.equal(game.players[0].bankrupt, true);
  assert.equal(game.ownership[1], undefined);
  assert.equal(game.phase, "gameover");
});

test("a player can raise cash to pay a jail fine before being bankrupted", () => {
  const game = createGame();
  game.started = true;
  game.phase = "preroll";
  game.players[0].inJail = true;
  game.players[0].cash = 20;
  game.players[0].properties = [5];
  game.ownership[5] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };

  assert.deepEqual(game.payJailFine("p1"), { ok: true, pendingDebt: true });
  assert.equal(game.players[0].cash, -30);
  assert.equal(game.players[0].inJail, true);
  assert.deepEqual(game.sellProperty("p1", 5), { ok: true, proceeds: BOARD[5].mortgage });
  assert.equal(game.players[0].cash, 70);
  assert.equal(game.players[0].inJail, false);
  assert.equal(game.pendingDebt, null);
  assert.equal(game.phase, "preroll");
});

test("a player who cannot pay rent pauses their turn for liquidation", () => {
  const game = createGame();
  game.addPlayer("p3", "Player Three", "s3");
  game.started = true;
  game.phase = "preroll";
  const roller = game.getPlayer("p1");
  roller.position = 36;
  roller.cash = 10;
  game.players[1].properties = [39];
  game.ownership[39] = { ownerId: "p2", houses: 0, hotel: true, mortgaged: false };

  const values = [0, 0.2]; // dice 1 and 2 -> lands on New York (39)
  const realRandom = Math.random;
  Math.random = () => values.shift() ?? 0.5;
  try {
    assert.equal(game.rollDice("p1").error, undefined);
  } finally {
    Math.random = realRandom;
  }

  assert.equal(roller.bankrupt, false);
  assert.equal(game.currentPlayer().id, "p1");
  assert.equal(game.phase, "debt");
  assert.equal(game.pendingDebt.playerId, "p1");
});

test("bots fill empty seats and give a seat back to a joining human", () => {
  const game = new Game("bots");
  game.addPlayer("h1", "Human", "s1");
  game.settings.maxPlayers = 3;
  game.settings.allowBots = true;
  game.syncBots();
  assert.equal(game.players.length, 3);
  assert.equal(game.players.filter(p => p.bot).length, 2);

  assert.deepEqual(game.addPlayer("h2", "Second", "s2"), { ok: true });
  assert.equal(game.players.length, 3);
  assert.equal(game.players.filter(p => p.bot).length, 1);
});

test("settings can only be changed before the game starts and are validated", () => {
  const game = createGame();
  assert.match(game.updateSettings({ settings: { maxPlayers: 99 } }).error, /between 2 and 8/i);
  assert.deepEqual(game.updateSettings({ settings: { maxPlayers: 6, startingCash: 2000 }, rules: { mortgage: true } }), { ok: true });
  game.chooseAppearance("p1", "#c1dd4b");
  game.chooseAppearance("p2", "#f8c845");
  game.start();
  assert.equal(game.players[0].cash, 2000);
  assert.match(game.updateSettings({ settings: { maxPlayers: 4 } }).error, /after the game starts/i);
});

test("mortgages can be turned off, and even-build can be relaxed", () => {
  const game = createGame();
  game.players[0].properties = [1, 3];
  game.ownership[1] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };
  game.ownership[3] = { ownerId: "p1", houses: 0, hotel: false, mortgaged: false };
  game.rules.mortgage = false;
  assert.match(game.mortgageProperty("p1", 1).error, /turned off/i);

  game.rules.evenBuild = false;
  assert.deepEqual(game.buildHouse("p1", 1), { ok: true });
  assert.deepEqual(game.buildHouse("p1", 1), { ok: true });
  assert.equal(game.ownership[1].houses, 2);
});

test("game actions emit animation events for the client", () => {
  const game = createGame();
  game.players[0].properties = [];
  game.currentPlayer().position = 1;
  game.phase = "awaiting_buy";
  game.buyProperty("p1");
  const buy = game.events.find(e => e.type === "buy");
  assert.equal(buy.spaceId, 1);
  assert.equal(buy.playerId, "p1");
  assert.ok(game.getState().events.length > 0);
});
