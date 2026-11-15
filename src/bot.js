import {
  ALL_TOKENS,
  COLORS,
  applyAction,
  paymentFor,
  playerBonuses,
  playerScore,
  tokenTotal,
} from "./game.js";

export const BOT_LEVELS = {
  beginner: { label: "초급", subtitle: "처음 만난 보석 친구", stars: 1 },
  intermediate: { label: "중급", subtitle: "효율을 챙기는 수집가", stars: 2 },
  advanced: { label: "고급", subtitle: "귀족과 견제까지 계산", stars: 3 },
  legendary: { label: "레전더리", subtitle: "상대의 다음 수까지 예측", stars: 4 },
};

const combinations = (items, size, start = 0, prefix = [], result = []) => {
  if (prefix.length === size) { result.push(prefix); return result; }
  for (let index = start; index < items.length; index += 1) combinations(items, size, index + 1, [...prefix, items[index]], result);
  return result;
};

export function legalBotActions(game, playerId) {
  if (game.status !== "playing") return [];
  if (game.pending) {
    if (game.pending.playerId !== playerId) return [];
    if (game.pending.type === "noble") return game.pending.nobleIds.map((nobleId) => ({ type: "noble", nobleId }));
    if (game.pending.type === "discard") return [{ type: "discard", tokens: chooseDiscard(game, playerId, game.pending.count) }];
  }
  const player = game.players[game.turn];
  if (player?.id !== playerId) return [];
  const actions = [];

  for (const tier of [1, 2, 3]) {
    for (const card of game.board[tier]) {
      if (paymentFor(player, card)) actions.push({ type: "buy", source: String(tier), cardId: card.id });
    }
  }
  for (const card of player.reserved) {
    if (paymentFor(player, card)) actions.push({ type: "buy", source: "reserved", cardId: card.id });
  }

  const available = COLORS.filter((color) => game.supply[color] > 0);
  const takeSize = Math.min(3, available.length);
  if (takeSize >= 2) combinations(available, takeSize).forEach((colors) => actions.push({ type: "take", colors }));
  COLORS.filter((color) => game.supply[color] >= 4).forEach((color) => actions.push({ type: "take", colors: [color, color] }));

  if (player.reserved.length < 3) {
    for (const tier of [1, 2, 3]) {
      game.board[tier].forEach((card) => actions.push({ type: "reserve", source: String(tier), cardId: card.id }));
      if (game.decks[tier].length) actions.push({ type: "reserve", source: String(tier) });
    }
  }
  return actions;
}

function chooseDiscard(game, playerId, count) {
  const player = game.players.find((item) => item.id === playerId);
  const market = [...game.board[1], ...game.board[2], ...game.board[3], ...player.reserved];
  const bonuses = playerBonuses(player);
  const usefulness = Object.fromEntries(ALL_TOKENS.map((color) => [color, color === "gold" ? 99 : market.reduce((sum, card) => sum + Math.max(0, card.cost[color] - bonuses[color]), 0)]));
  const tokens = {};
  let left = count;
  [...ALL_TOKENS].sort((a, b) => usefulness[a] - usefulness[b]).forEach((color) => {
    const amount = Math.min(left, player.tokens[color]);
    if (amount) tokens[color] = amount;
    left -= amount;
  });
  return tokens;
}

function actionCard(game, action, player) {
  if (!action.cardId) return null;
  if (action.source === "reserved") return player.reserved.find((card) => card.id === action.cardId);
  return game.board[Number(action.source)]?.find((card) => card.id === action.cardId);
}

function nobleDistance(game, player) {
  const bonuses = playerBonuses(player);
  if (!game.nobles.length) return 0;
  return Math.min(...game.nobles.map((noble) => Object.entries(noble.cost).reduce((sum, [color, count]) => sum + Math.max(0, count - bonuses[color]), 0)));
}

function stateValue(game, playerId) {
  const player = game.players.find((item) => item.id === playerId);
  if (!player) return -9999;
  const bonuses = playerBonuses(player);
  const balance = Math.min(...COLORS.map((color) => bonuses[color]));
  const affordable = [...game.board[1], ...game.board[2], ...game.board[3], ...player.reserved].filter((card) => paymentFor(player, card));
  return playerScore(player) * 42 + player.cards.length * 7 + balance * 4 + tokenTotal(player) * 1.1 + affordable.reduce((sum, card) => sum + 2 + card.points * 5, 0) - nobleDistance(game, player) * 2.2;
}

function actionValue(game, playerId, action) {
  const player = game.players.find((item) => item.id === playerId);
  if (action.type === "noble") return 300;
  if (action.type === "discard") return 0;
  const card = actionCard(game, action, player);
  if (action.type === "buy" && card) {
    const nobleHelp = game.nobles.reduce((sum, noble) => sum + (noble.cost[card.bonus] ? 1 : 0), 0);
    const payment = paymentFor(player, card);
    const spend = payment ? Object.values(payment).reduce((sum, value) => sum + value, 0) : 0;
    return 95 + card.points * 45 + card.tier * 5 + nobleHelp * 6 - spend * 1.4;
  }
  if (action.type === "take") {
    const targets = [...game.board[1], ...game.board[2], ...game.board[3], ...player.reserved];
    const bonuses = playerBonuses(player);
    return 22 + action.colors.reduce((sum, color) => sum + targets.reduce((need, card) => need + Math.max(0, card.cost[color] - bonuses[color] - player.tokens[color]), 0), 0) / Math.max(1, targets.length);
  }
  if (action.type === "reserve" && card) {
    const opponents = game.players.filter((item) => item.id !== playerId);
    const threat = opponents.some((opponent) => paymentFor(opponent, card)) ? 24 : 0;
    return 10 + card.points * 13 + card.tier * 3 + threat + (game.supply.gold > 0 ? 8 : 0);
  }
  return 1;
}

function applyAndResolve(game, playerId, action) {
  let next = applyAction(game, playerId, action);
  let guard = 0;
  while (next.pending?.playerId === playerId && guard < 3) {
    const followup = legalBotActions(next, playerId)[0];
    if (!followup) break;
    next = applyAction(next, playerId, followup);
    guard += 1;
  }
  return next;
}

function rankedActions(game, playerId) {
  return legalBotActions(game, playerId).map((action) => {
    let next;
    try { next = applyAndResolve(game, playerId, action); }
    catch { return { action, score: -99999, next: null }; }
    return { action, next, score: actionValue(game, playerId, action) + stateValue(next, playerId) };
  }).sort((a, b) => b.score - a.score);
}

export function chooseBotAction(game, playerId, difficulty = "intermediate", random = Math.random) {
  const actions = legalBotActions(game, playerId);
  if (!actions.length) return null;
  if (game.pending) return actions[0];
  if (difficulty === "beginner") {
    const buys = actions.filter((action) => action.type === "buy");
    const pool = buys.length && random() < 0.55 ? buys : actions;
    return pool[Math.floor(random() * pool.length)];
  }
  const ranked = rankedActions(game, playerId);
  if (difficulty === "intermediate") return ranked[Math.min(Math.floor(random() * Math.min(3, ranked.length)), ranked.length - 1)].action;
  if (difficulty === "advanced") return ranked[0].action;

  const opponent = game.players.find((player) => player.id !== playerId);
  let best = ranked[0];
  let bestScore = -Infinity;
  for (const candidate of ranked.slice(0, 12)) {
    if (!candidate.next) continue;
    const replies = candidate.next.status === "playing" && candidate.next.players[candidate.next.turn]?.id === opponent?.id
      ? rankedActions(candidate.next, opponent.id).slice(0, 8)
      : [];
    const opponentGain = replies.length ? Math.max(...replies.map((reply) => reply.score - stateValue(candidate.next, opponent.id))) : 0;
    const score = candidate.score - opponentGain * 0.72;
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best.action;
}

export function playTimedTurn(game, playerId, random = Math.random) {
  let next = game;
  let guard = 0;
  while (next.status === "playing" && (next.players[next.turn]?.id === playerId || next.pending?.playerId === playerId) && guard < 4) {
    const action = chooseBotAction(next, playerId, "beginner", random);
    if (!action) break;
    next = applyAction(next, playerId, action);
    guard += 1;
  }
  next.log = [`${game.players.find((player) => player.id === playerId)?.name || "플레이어"}님의 30초가 지나 자동 진행했어요.`, ...next.log].slice(0, 16);
  return next;
}
