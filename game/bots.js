const { BOARD } = require("./board");

// Drives every bot player in one Game. Call poke() after each state change;
// the driver schedules at most one bot action at a time so clients have time
// to play their animations between moves.
class BotDriver {
  constructor(game, onChange) {
    this.game = game;
    this.onChange = onChange;
    this.timer = null;
    this.stopped = false;
    this.failures = 0;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  poke() {
    if (this.stopped || this.timer || !this.actor()) return;
    const g = this.game;
    const slow = g.phase === "awaiting_buy" || g.phase === "postroll";
    const delay = slow ? 2600 + Math.random() * 1400 : 1300 + Math.random() * 800;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.step();
    }, delay);
  }

  // The bot who must act next, if any.
  actor() {
    const g = this.game;
    if (!g.started || g.phase === "gameover") return null;
    const auction = g.pendingAuction;
    if (auction) {
      const bidder = g.getPlayer(auction.order[auction.currentBidderIdx]);
      return bidder && bidder.bot && !bidder.bankrupt ? bidder : null;
    }
    const trade = g.pendingTrade;
    if (trade) {
      const to = g.getPlayer(trade.toId);
      if (to && to.bot && !to.bankrupt) return to;
    }
    const current = g.currentPlayer();
    return current && current.bot && !current.bankrupt ? current : null;
  }

  step() {
    const bot = this.actor();
    if (!bot) return;
    let result;
    try {
      result = this.act(bot);
    } catch (error) {
      result = { error: String(error) };
    }
    if (result && result.error) {
      this.failures++;
      if (this.failures >= 3) {
        this.fallback(bot);
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
    this.onChange();
  }

  act(bot) {
    const g = this.game;
    const auction = g.pendingAuction;
    if (auction && auction.order[auction.currentBidderIdx] === bot.id) {
      const space = BOARD[auction.spaceId];
      const ceiling = Math.min(bot.cash - 50, space.price);
      const bid = auction.highestBid + 10;
      return bid <= ceiling ? g.auctionBid(bot.id, bid) : g.auctionPass(bot.id);
    }
    if (g.pendingTrade && g.pendingTrade.toId === bot.id) {
      return g.respondTrade(bot.id, false);
    }
    switch (g.phase) {
      case "preroll":
        if (bot.inJail) {
          if (bot.jailCards > 0) return g.useJailCard(bot.id);
          if (bot.cash > 300) return g.payJailFine(bot.id);
        }
        return g.rollDice(bot.id);
      case "awaiting_buy": {
        const space = BOARD[bot.position];
        if (bot.cash - space.price >= 100) return g.buyProperty(bot.id);
        return g.declineBuy(bot.id);
      }
      case "postroll": {
        if (this.tryBuild(bot)) return { ok: true };
        return g.endTurn(bot.id);
      }
      default:
        return g.endTurn(bot.id);
    }
  }

  tryBuild(bot) {
    const g = this.game;
    const groups = {};
    for (const space of BOARD) {
      if (space.type === "property") (groups[space.group] ||= []).push(space);
    }
    for (const spaces of Object.values(groups)) {
      if (!spaces.every(s => g.ownership[s.id]?.ownerId === bot.id)) continue;
      const level = s => (g.ownership[s.id].hotel ? 5 : g.ownership[s.id].houses);
      const ordered = [...spaces].sort((a, b) => level(a) - level(b));
      const target = ordered[0];
      if (level(target) >= 5 || bot.cash < target.houseCost + 300) continue;
      if (g.buildHouse(bot.id, target.id).ok) return true;
    }
    return false;
  }

  fallback(bot) {
    const g = this.game;
    if (g.pendingAuction) return g.auctionPass(bot.id);
    if (g.pendingTrade && g.pendingTrade.toId === bot.id) return g.respondTrade(bot.id, false);
    if (g.phase === "awaiting_buy") return g.declineBuy(bot.id);
    if (g.phase === "postroll") return g.endTurn(bot.id);
    if (g.phase === "preroll") return g.rollDice(bot.id);
    return null;
  }
}

module.exports = { BotDriver };
