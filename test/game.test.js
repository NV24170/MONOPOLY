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

test("card debt does not overwrite a game-over phase", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  player.position = 7;
  player.cash = 1;
  game.chanceDeck = [{ action: "pay", amount: 50 }];

  game.resolveLanding(player);

  assert.equal(game.phase, "gameover");
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

test("pay-each cards declare bankruptcy when the payer cannot pay everyone", () => {
  const game = createGame();
  const player = game.getPlayer("p1");
  game.addPlayer("p3", "Player Three", "s3");
  player.cash = 60;

  game.applyCard(player, { action: "pay_each", amount: 40 });

  assert.equal(player.bankrupt, true);
  assert.equal(player.cash, 0);
  assert.equal(game.getPlayer("p3").cash, 1540);
});

test("collect-each cards declare bankruptcy for a player who cannot pay", () => {
  const game = createGame();
  const collector = game.getPlayer("p1");
  game.getPlayer("p2").cash = 20;

  game.applyCard(collector, { action: "collect_each", amount: 50 });

  assert.equal(game.getPlayer("p2").bankrupt, true);
  assert.equal(collector.cash, 1550);
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

test("a jail fine cannot put a player into negative cash", () => {
  const game = createGame();
  game.started = true;
  game.players[0].inJail = true;
  game.players[0].cash = 20;

  assert.match(game.payJailFine("p1").error, /enough cash/i);
  assert.equal(game.players[0].cash, 20);
});