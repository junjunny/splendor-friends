export const COLORS = ["white", "blue", "green", "red", "black"];
export const ALL_TOKENS = [...COLORS, "gold"];
export const TURN_DURATION_MS = 30_000;
export const COLOR_META = {
  white: { label: "다이아몬드", short: "다", icon: "◇", shape: "diamond", hex: "#f6f1e7" },
  blue: { label: "사파이어", short: "사", icon: "⬢", shape: "hexagon", hex: "#2f80ed" },
  green: { label: "에메랄드", short: "에", icon: "▣", shape: "octagon", hex: "#27ae60" },
  red: { label: "루비", short: "루", icon: "♥", shape: "ruby", hex: "#eb3b5a" },
  black: { label: "오닉스", short: "오", icon: "●", shape: "onyx", hex: "#332b3a" },
  gold: { label: "골드 조커", short: "골", icon: "★", shape: "star", hex: "#f2b705" },
};

// 먼작귀 세계관 안의 캐릭터/풍경만 사용해 카드 아트를 구성해요.
// 오데는 장면별 변주를 많이 넣어 2·3단계 카드에서 자주 만날 수 있게 했어요.
export const CHARACTER_ART = [
  "chiikawa", "hachiware", "usagi", "momonga", "ode", "ode-market", "ode-picnic", "ode-night",
  "kurimanju", "rakko", "shisa-furuhonya", "kani", "pochette-armor", "ramen-armor", "labor-armor",
  "master-armor", "pajama-party", "seiren", "old-lady",
];
export const BACKGROUND_ART = ["bg-meadow", "bg-cave", "bg-ramen"];

const COST_PATTERNS = {
  1: [
    [0, 1, 1, 1, 1], [0, 2, 0, 2, 0], [0, 0, 2, 1, 2], [0, 3, 0, 0, 0],
    [0, 0, 0, 4, 0], [0, 1, 2, 1, 1], [0, 2, 0, 1, 2], [0, 0, 0, 0, 3],
  ],
  2: [
    [0, 2, 2, 3, 0], [0, 0, 3, 2, 3], [0, 5, 0, 0, 0], [0, 0, 0, 5, 3],
    [0, 3, 0, 4, 2], [0, 0, 6, 0, 0],
  ],
  3: [
    [0, 3, 3, 5, 3], [0, 0, 7, 0, 0], [0, 3, 0, 6, 3], [0, 0, 0, 7, 3],
  ],
};

// Space Cowboys 클래식판의 개발 카드 90장(1/2/3단계 = 40/30/20).
// 열 순서: 단계, 보너스, 점수, 흰색, 파랑, 초록, 빨강, 검정.
const OFFICIAL_CARD_ROWS = [
	[1, "black", 0, 1, 1, 1, 1, 0],
	[1, "black", 0, 1, 1, 1, 2, 0],
	[1, "black", 0, 2, 0, 1, 2, 0],
	[1, "black", 0, 0, 1, 0, 3, 1],
	[1, "black", 0, 0, 0, 2, 1, 0],
	[1, "black", 0, 2, 0, 2, 0, 0],
	[1, "black", 0, 0, 0, 3, 0, 0],
	[1, "black", 1, 0, 4, 0, 0, 0],
	[1, "blue", 0, 1, 0, 1, 1, 1],
	[1, "blue", 0, 1, 0, 1, 2, 1],
	[1, "blue", 0, 1, 0, 2, 2, 0],
	[1, "blue", 0, 0, 1, 3, 1, 0],
	[1, "blue", 0, 1, 2, 0, 0, 0],
	[1, "blue", 0, 2, 0, 2, 0, 0],
	[1, "blue", 0, 0, 3, 0, 0, 0],
	[1, "blue", 1, 0, 0, 0, 4, 0],
	[1, "white", 0, 0, 1, 1, 1, 1],
	[1, "white", 0, 0, 1, 2, 1, 1],
	[1, "white", 0, 0, 2, 2, 0, 1],
	[1, "white", 0, 1, 1, 0, 0, 3],
	[1, "white", 0, 0, 1, 0, 2, 0],
	[1, "white", 0, 2, 2, 0, 0, 0],
	[1, "white", 0, 0, 0, 3, 0, 0],
	[1, "white", 1, 0, 0, 4, 0, 0],
	[1, "green", 0, 1, 1, 0, 1, 1],
	[1, "green", 0, 1, 1, 0, 1, 2],
	[1, "green", 0, 2, 1, 0, 2, 0],
	[1, "green", 0, 1, 0, 3, 1, 0],
	[1, "green", 0, 0, 0, 1, 0, 2],
	[1, "green", 0, 0, 2, 0, 2, 0],
	[1, "green", 0, 0, 0, 0, 3, 0],
	[1, "green", 1, 0, 0, 0, 0, 4],
	[1, "red", 0, 1, 1, 1, 0, 1],
	[1, "red", 0, 2, 1, 1, 0, 1],
	[1, "red", 0, 2, 0, 1, 0, 2],
	[1, "red", 0, 1, 3, 0, 0, 1],
	[1, "red", 0, 0, 0, 2, 1, 0],
	[1, "red", 0, 0, 2, 0, 0, 2],
	[1, "red", 0, 0, 0, 0, 0, 3],
	[1, "red", 1, 0, 0, 0, 0, 4],
	[2, "black", 1, 3, 2, 2, 0, 0],
	[2, "black", 1, 3, 2, 0, 0, 2],
	[2, "black", 2, 0, 1, 4, 2, 0],
	[2, "black", 2, 0, 0, 5, 3, 0],
	[2, "black", 2, 5, 0, 0, 0, 0],
	[2, "black", 3, 0, 0, 0, 0, 6],
	[2, "blue", 1, 0, 2, 2, 3, 0],
	[2, "blue", 1, 0, 3, 2, 0, 3],
	[2, "blue", 2, 5, 0, 3, 0, 0],
	[2, "blue", 2, 2, 4, 0, 1, 0],
	[2, "blue", 2, 0, 0, 5, 0, 0],
	[2, "blue", 3, 0, 0, 0, 6, 0],
	[2, "white", 1, 0, 0, 3, 2, 2],
	[2, "white", 1, 2, 0, 0, 3, 3],
	[2, "white", 2, 0, 0, 1, 4, 2],
	[2, "white", 2, 0, 3, 0, 5, 0],
	[2, "white", 2, 0, 0, 0, 0, 5],
	[2, "white", 3, 0, 0, 0, 0, 6],
	[2, "green", 1, 3, 0, 0, 3, 2],
	[2, "green", 1, 2, 3, 0, 0, 2],
	[2, "green", 2, 0, 2, 0, 0, 4],
	[2, "green", 2, 0, 0, 5, 3, 0],
	[2, "green", 2, 0, 5, 0, 0, 0],
	[2, "green", 3, 0, 0, 6, 0, 0],
	[2, "red", 1, 2, 0, 0, 2, 3],
	[2, "red", 1, 2, 0, 3, 0, 3],
	[2, "red", 2, 1, 0, 0, 4, 2],
	[2, "red", 2, 0, 0, 0, 3, 5],
	[2, "red", 2, 0, 0, 0, 0, 5],
	[2, "red", 3, 0, 0, 0, 6, 0],
	[3, "black", 3, 3, 3, 5, 3, 0],
	[3, "black", 4, 0, 0, 0, 7, 0],
	[3, "black", 4, 3, 0, 0, 6, 3],
	[3, "black", 5, 3, 0, 0, 7, 0],
	[3, "blue", 3, 3, 0, 3, 3, 5],
	[3, "blue", 4, 7, 0, 0, 0, 0],
	[3, "blue", 4, 6, 3, 0, 0, 3],
	[3, "blue", 5, 7, 0, 0, 0, 3],
	[3, "white", 3, 0, 3, 3, 3, 5],
	[3, "white", 4, 0, 0, 0, 0, 7],
	[3, "white", 4, 3, 6, 0, 0, 3],
	[3, "white", 5, 0, 7, 0, 0, 3],
	[3, "green", 3, 5, 3, 0, 3, 3],
	[3, "green", 4, 0, 7, 0, 0, 0],
	[3, "green", 4, 3, 3, 6, 0, 0],
	[3, "green", 5, 0, 0, 7, 3, 0],
	[3, "red", 3, 3, 3, 3, 0, 5],
	[3, "red", 4, 0, 0, 7, 0, 0],
	[3, "red", 4, 3, 0, 3, 6, 0],
	[3, "red", 5, 0, 3, 7, 0, 0],
];

function hashSeed(seed) {
  let value = 2166136261;
  for (const char of String(seed)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createDeck(tier, seed = "gem-friends") {
  const cards = OFFICIAL_CARD_ROWS
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row[0] === tier)
    .map(({ row, index }) => {
      const [cardTier, bonus, points, ...costs] = row;
      const useBackground = cardTier === 1;
      return {
        id: `card-${index}`,
        tier: cardTier,
        bonus,
        points,
        // 모든 카드가 서로 다른 파일을 가리키도록 고유 SVG 아트 키를 부여해요.
        // SVG 안에서 먼작귀 원화와 배경을 카드별로 다른 크롭/장식으로 합성합니다.
        art: `generated/card-${String(index).padStart(3, "0")}.jpg`,
        artVariant: index,
        artType: useBackground ? "background" : "character",
        cost: Object.fromEntries(COLORS.map((color, colorIndex) => [color, costs[colorIndex]])),
      };
    });
  return shuffle(cards, seededRandom(`${seed}-tier-${tier}`));
}

export function createNobles(seed = "gem-friends") {
  const patterns = [
    { white: 4, blue: 4 }, { blue: 4, green: 4 }, { green: 4, red: 4 },
    { red: 4, black: 4 }, { black: 4, white: 4 },
    { white: 3, blue: 3, green: 3 }, { blue: 3, green: 3, red: 3 },
    { green: 3, red: 3, black: 3 }, { red: 3, black: 3, white: 3 },
    { black: 3, white: 3, blue: 3 },
  ];
  return shuffle(patterns.map((cost, index) => ({ id: `noble-${index}`, points: 3, cost })), seededRandom(`${seed}-nobles`));
}

export function emptyTokens() {
  return Object.fromEntries(ALL_TOKENS.map((color) => [color, 0]));
}

function makePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar || "chiikawa",
    isBot: Boolean(player.isBot),
    difficulty: player.difficulty || null,
    connected: true,
    tokens: emptyTokens(),
    cards: [],
    reserved: [],
    nobles: [],
  };
}

function refillRow(deck, row) {
  while (row.length < 4 && deck.length) row.push(deck.pop());
}

// seed를 바꾸면 같은 방에서도 카드와 귀족이 새로 섞여요(다시하기).
export function createGame(players, roomCode = "JEWEL", seed = roomCode) {
  if (players.length < 2 || players.length > 4) throw new Error("게임은 2~4명이 필요해요.");
  const tokenCount = players.length === 2 ? 4 : players.length === 3 ? 5 : 7;
  const decks = { 1: createDeck(1, seed), 2: createDeck(2, seed), 3: createDeck(3, seed) };
  const board = { 1: [], 2: [], 3: [] };
  [1, 2, 3].forEach((tier) => refillRow(decks[tier], board[tier]));
  return {
    status: "playing",
    roomCode,
    players: players.map(makePlayer),
    supply: { ...Object.fromEntries(COLORS.map((color) => [color, tokenCount])), gold: 5 },
    decks,
    board,
    nobles: createNobles(seed).slice(0, players.length + 1),
    turn: 0,
    round: 1,
    finalRound: false,
    turnStartedAt: Date.now(),
    turnDeadline: Date.now() + TURN_DURATION_MS,
    pending: null,
    log: [`${players[0].name}님의 차례로 게임을 시작했어요!`],
    activity: [{ type: "turn", playerId: players[0].id, playerName: players[0].name, text: `${players[0].name}님의 차례로 게임을 시작했어요!` }],
    winnerIds: [],
  };
}

export function playerBonuses(player) {
  return Object.fromEntries(COLORS.map((color) => [color, player.cards.filter((card) => card.bonus === color).length]));
}

export function playerScore(player) {
  return player.cards.reduce((sum, card) => sum + card.points, 0) + player.nobles.reduce((sum, noble) => sum + noble.points, 0);
}

export function tokenTotal(player) {
  return ALL_TOKENS.reduce((sum, color) => sum + player.tokens[color], 0);
}

export function paymentFor(player, card) {
  const bonuses = playerBonuses(player);
  const payment = emptyTokens();
  let goldNeeded = 0;
  for (const color of COLORS) {
    const needed = Math.max(0, card.cost[color] - bonuses[color]);
    payment[color] = Math.min(needed, player.tokens[color]);
    goldNeeded += Math.max(0, needed - player.tokens[color]);
  }
  payment.gold = goldNeeded;
  return goldNeeded <= player.tokens.gold ? payment : null;
}

function eligibleNobles(game, player) {
  const bonuses = playerBonuses(player);
  return game.nobles.filter((noble) => Object.entries(noble.cost).every(([color, count]) => bonuses[color] >= count));
}

function cloneGame(game) {
  return structuredClone(game);
}

function currentPlayer(game, playerId) {
  const player = game.players[game.turn];
  if (!player || player.id !== playerId) throw new Error("지금은 내 차례가 아니에요.");
  if (game.pending) throw new Error("먼저 진행 중인 선택을 마쳐주세요.");
  return player;
}

function addLog(game, message, activity = {}) {
  game.log = [message, ...game.log].slice(0, 16);
  game.seq = (game.seq || 0) + 1; // 기록마다 고유한 순번을 붙여서 화면이 새 기록만 골라낼 수 있어요.
  game.activity = [{ ...activity, id: `activity-${game.seq}`, seq: game.seq, text: message }, ...(game.activity || [])].slice(0, 16);
}

function describeColors(colors) {
  return colors.map((color) => COLOR_META[color]?.label || color).join(" · ");
}

function finishTurn(game, player) {
  const nobles = eligibleNobles(game, player);
  if (nobles.length === 1) {
    const noble = nobles[0];
    player.nobles.push(noble);
    game.nobles = game.nobles.filter((item) => item.id !== noble.id);
    addLog(game, `${player.name}님에게 귀족이 찾아왔어요! +3점`, { type: "noble", playerId: player.id, playerName: player.name });
  } else if (nobles.length > 1) {
    game.pending = { type: "noble", playerId: player.id, nobleIds: nobles.map((noble) => noble.id) };
    return game;
  }
  return advanceTurn(game, player);
}

function afterAction(game, player) {
  const excess = tokenTotal(player) - 10;
  if (excess > 0) {
    game.pending = { type: "discard", playerId: player.id, count: excess };
    return game;
  }
  return finishTurn(game, player);
}

function advanceTurn(game, actingPlayer) {
  if (!game.finalRound && playerScore(actingPlayer) >= 15) {
    game.finalRound = true;
    addLog(game, `마지막 라운드! ${actingPlayer.name}님이 15점에 도달했어요.`);
  }
  const isRoundEnd = game.turn === game.players.length - 1;
  if (game.finalRound && isRoundEnd) {
    const scores = game.players.map((player) => ({ player, score: playerScore(player), cards: player.cards.length }));
    const high = Math.max(...scores.map((entry) => entry.score));
    const contenders = scores.filter((entry) => entry.score === high);
    const fewest = Math.min(...contenders.map((entry) => entry.cards));
    game.winnerIds = contenders.filter((entry) => entry.cards === fewest).map((entry) => entry.player.id);
    game.status = "finished";
    addLog(game, `게임 종료! ${game.players.filter((player) => game.winnerIds.includes(player.id)).map((player) => player.name).join(", ")} 승리!`);
    return game;
  }
  game.turn = (game.turn + 1) % game.players.length;
  if (game.turn === 0) game.round += 1;
  game.turnStartedAt = Date.now();
  game.turnDeadline = game.turnStartedAt + TURN_DURATION_MS;
  addLog(game, `${game.players[game.turn].name}님의 차례예요.`, { type: "turn", playerId: game.players[game.turn].id, playerName: game.players[game.turn].name });
  return game;
}

export function takeTokens(gameInput, playerId, colors) {
  const game = cloneGame(gameInput);
  const player = currentPlayer(game, playerId);
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 3) throw new Error("보석을 올바르게 골라주세요.");
  const unique = new Set(colors);
  if (unique.size === 1) {
    const color = colors[0];
    if (!COLORS.includes(color) || colors.length !== 2 || game.supply[color] < 4) throw new Error("같은 색 2개는 공급처에 4개 이상 있을 때만 가져올 수 있어요.");
  } else if (unique.size === colors.length) {
    if (colors.some((color) => !COLORS.includes(color) || game.supply[color] < 1)) throw new Error("공급처에 있는 서로 다른 색만 고를 수 있어요.");
  } else {
    throw new Error("서로 다른 색 최대 3개 또는 같은 색 2개를 골라주세요.");
  }
  colors.forEach((color) => { game.supply[color] -= 1; player.tokens[color] += 1; });
  addLog(game, `${player.name}님이 ${describeColors(colors)} 보석을 가져갔어요.`, { type: "take", playerId: player.id, playerName: player.name, colors: [...colors] });
  return afterAction(game, player);
}

function findCard(game, source, cardId) {
  if (source === "reserved") {
    const player = game.players[game.turn];
    return { card: player.reserved.find((item) => item.id === cardId), remove: () => { player.reserved = player.reserved.filter((item) => item.id !== cardId); } };
  }
  const tier = Number(source);
  const card = game.board[tier]?.find((item) => item.id === cardId);
  return { card, remove: () => { game.board[tier] = game.board[tier].filter((item) => item.id !== cardId); refillRow(game.decks[tier], game.board[tier]); } };
}

export function buyCard(gameInput, playerId, source, cardId) {
  const game = cloneGame(gameInput);
  const player = currentPlayer(game, playerId);
  const found = findCard(game, source, cardId);
  if (!found.card) throw new Error("카드를 찾을 수 없어요.");
  const payment = paymentFor(player, found.card);
  if (!payment) throw new Error("이 카드를 살 보석이 아직 부족해요.");
  ALL_TOKENS.forEach((color) => { player.tokens[color] -= payment[color]; game.supply[color] += payment[color]; });
  found.remove();
  player.cards.push(found.card);
  addLog(game, `${player.name}님이 ${found.card.tier}단계 ${COLOR_META[found.card.bonus].label} 카드를 샀어요${found.card.points ? ` · +${found.card.points}점` : ""}`, { type: "buy", playerId: player.id, playerName: player.name, card: found.card });
  return finishTurn(game, player);
}

export function reserveCard(gameInput, playerId, source, cardId = null) {
  const game = cloneGame(gameInput);
  const player = currentPlayer(game, playerId);
  if (player.reserved.length >= 3) throw new Error("예약 카드는 최대 3장이에요.");
  const tier = Number(source);
  let card;
  if (cardId) {
    const found = findCard(game, tier, cardId);
    card = found.card;
    if (!card) throw new Error("카드를 찾을 수 없어요.");
    found.remove();
  } else {
    card = game.decks[tier]?.pop();
    if (!card) throw new Error("카드 더미가 비었어요.");
    card.secret = true; // 더미에서 뽑은 예약 카드는 본인만 볼 수 있어요.
  }
  player.reserved.push(card);
  const receivedGold = game.supply.gold > 0;
  if (receivedGold) { game.supply.gold -= 1; player.tokens.gold += 1; }
  addLog(game, `${player.name}님이 ${tier}단계 카드를 예약했어요.${receivedGold ? " 골드 조커 +1" : ""}`, { type: "reserve", playerId: player.id, playerName: player.name, card, receivedGold });
  return afterAction(game, player);
}

export function discardTokens(gameInput, playerId, tokens) {
  const game = cloneGame(gameInput);
  const pending = game.pending;
  if (pending?.type !== "discard" || pending.playerId !== playerId) throw new Error("반납할 차례가 아니에요.");
  const player = game.players.find((item) => item.id === playerId);
  const total = Object.values(tokens || {}).reduce((sum, count) => sum + count, 0);
  if (total !== pending.count) throw new Error(`${pending.count}개를 정확히 반납해주세요.`);
  for (const color of ALL_TOKENS) {
    const count = tokens[color] || 0;
    if (count < 0 || count > player.tokens[color]) throw new Error("보유한 수량보다 많이 반납할 수 없어요.");
    player.tokens[color] -= count;
    game.supply[color] += count;
  }
  game.pending = null;
  addLog(game, `${player.name}님이 보석 ${total}개를 반납했어요.`, { type: "discard", playerId: player.id, playerName: player.name, colors: Object.entries(tokens || {}).flatMap(([color, count]) => Array.from({ length: count || 0 }, () => color)) });
  return finishTurn(game, player);
}

export function chooseNoble(gameInput, playerId, nobleId) {
  const game = cloneGame(gameInput);
  const pending = game.pending;
  if (pending?.type !== "noble" || pending.playerId !== playerId || !pending.nobleIds.includes(nobleId)) throw new Error("선택할 수 없는 귀족이에요.");
  const player = game.players.find((item) => item.id === playerId);
  const noble = game.nobles.find((item) => item.id === nobleId);
  player.nobles.push(noble);
  game.nobles = game.nobles.filter((item) => item.id !== nobleId);
  game.pending = null;
  addLog(game, `${player.name}님이 귀족을 맞이했어요! +3점`, { type: "noble", playerId: player.id, playerName: player.name });
  return advanceTurn(game, player);
}

export function applyAction(game, playerId, action) {
  switch (action.type) {
    case "take": return takeTokens(game, playerId, action.colors);
    case "buy": return buyCard(game, playerId, action.source, action.cardId);
    case "reserve": return reserveCard(game, playerId, action.source, action.cardId);
    case "discard": return discardTokens(game, playerId, action.tokens);
    case "noble": return chooseNoble(game, playerId, action.nobleId);
    default: throw new Error("알 수 없는 행동이에요.");
  }
}

// 플레이어마다 볼 수 있는 정보만 담아 보내요(실제 보드게임처럼).
// 더미 카드 내용과 남이 더미에서 예약한 카드는 숨기고, 장수만 남겨요.
export function viewFor(game, playerId) {
  return {
    ...game,
    decks: Object.fromEntries(Object.entries(game.decks).map(([tier, deck]) => [tier, deck.map(() => null)])),
    activity: (game.activity || []).map((entry) => (entry.card?.secret && entry.playerId !== playerId ? { ...entry, card: undefined } : entry)),
    players: game.players.map((player) => (player.id === playerId ? player : {
      ...player,
      reserved: player.reserved.map((card) => (card.secret ? { id: card.id, tier: card.tier, secret: true } : card)),
    })),
  };
}
