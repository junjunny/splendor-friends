import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  COLORS,
  applyAction,
  createDeck,
  createGame,
  viewFor,
  paymentFor,
  playerBonuses,
  tokenTotal,
} from "../src/game.js";
import { BOT_LEVELS, chooseBotAction, legalBotActions, playTimedTurn } from "../src/bot.js";

const players = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `친구${index + 1}`, avatar: "ruby" }));

test("인원별 공급처와 귀족 수가 클래식 규칙에 맞다", () => {
  for (const [count, gems] of [[2, 4], [3, 5], [4, 7]]) {
    const game = createGame(players(count), `ROOM${count}`);
    COLORS.forEach((color) => assert.equal(game.supply[color], gems));
    assert.equal(game.supply.gold, 5);
    assert.equal(game.nobles.length, count + 1);
  }
});

test("공식 개발 카드 덱은 40/30/20장이고 보너스 색별 장수가 같다", () => {
  for (const [tier, expected] of [[1, 40], [2, 30], [3, 20]]) {
    const deck = createDeck(tier, "CARD-CHECK");
    assert.equal(deck.length, expected);
    COLORS.forEach((color) => assert.equal(deck.filter((card) => card.bonus === color).length, expected / 5));
  }
});

test("1단계는 색별 1점 카드 한 장, 나머지는 0점이다", () => {
  const deck = createDeck(1, "POINT-CHECK");
  assert.equal(deck.filter((card) => card.points === 1).length, 5);
  assert.equal(deck.filter((card) => card.points === 0).length, 35);
});

test("카드 단계별 일러스트 방향과 카드별 변형 키가 유지된다", () => {
  const decks = [1, 2, 3].map((tier) => createDeck(tier, "ART-CHECK"));
  assert.ok(decks[0].every((card) => card.artType === "background"));
  assert.ok(decks.slice(1).flat().every((card) => card.artType === "character"));
  const allCards = decks.flat();
  assert.equal(new Set(allCards.map((card) => card.artVariant)).size, allCards.length);
  assert.equal(new Set(allCards.map((card) => card.art)).size, allCards.length);
  assert.ok(allCards.every((card) => card.art.endsWith(".jpg")));
  assert.ok(allCards.every((card) => existsSync(new URL(`../public/assets/cards/${card.art}`, import.meta.url))));
});

test("서로 다른 보석 3개를 가져오면 공급처와 플레이어 수량이 갱신된다", () => {
  const game = createGame(players(2), "TAKE3");
  const next = applyAction(game, "p0", { type: "take", colors: ["white", "blue", "green"] });
  assert.equal(next.players[0].tokens.white, 1);
  assert.equal(next.supply.white, 3);
  assert.equal(next.turn, 1);
});

test("같은 색 2개는 공급처에 4개 이상 있을 때만 가능하다", () => {
  const game = createGame(players(2), "DOUBLE");
  const next = applyAction(game, "p0", { type: "take", colors: ["red", "red"] });
  assert.equal(next.players[0].tokens.red, 2);
  assert.equal(next.supply.red, 2);
  assert.throws(() => applyAction(next, "p1", { type: "take", colors: ["red", "red"] }), /4개 이상/);
});

test("예약은 최대 3장이고 가능한 경우 골드 조커를 준다", () => {
  let game = createGame(players(2), "RESERVE");
  const first = game.board[1][0];
  game = applyAction(game, "p0", { type: "reserve", source: "1", cardId: first.id });
  assert.equal(game.players[0].reserved.length, 1);
  assert.equal(game.players[0].tokens.gold, 1);
  assert.equal(game.supply.gold, 4);
});

test("보너스 할인 뒤 부족분만 토큰과 골드로 지불한다", () => {
  const game = createGame(players(2), "PAYMENT");
  const player = game.players[0];
  player.cards.push({ bonus: "blue", points: 0 });
  player.tokens.white = 1;
  player.tokens.gold = 1;
  const card = { cost: { white: 1, blue: 2, green: 0, red: 0, black: 0 } };
  const payment = paymentFor(player, card);
  assert.deepEqual(playerBonuses(player), { white: 0, blue: 1, green: 0, red: 0, black: 0 });
  assert.equal(payment.white, 1);
  assert.equal(payment.blue, 0);
  assert.equal(payment.gold, 1);
});

test("턴 종료 시 10개를 넘으면 초과 토큰 반납을 먼저 요구한다", () => {
  const game = createGame(players(2), "LIMIT");
  game.players[0].tokens = { white: 2, blue: 2, green: 2, red: 2, black: 0, gold: 0 };
  const next = applyAction(game, "p0", { type: "take", colors: ["white", "blue", "green"] });
  assert.equal(tokenTotal(next.players[0]), 11);
  assert.deepEqual(next.pending, { type: "discard", playerId: "p0", count: 1 });
  const resolved = applyAction(next, "p0", { type: "discard", tokens: { white: 1 } });
  assert.equal(tokenTotal(resolved.players[0]), 10);
  assert.equal(resolved.turn, 1);
});

test("초급부터 레전더리까지 모든 봇이 합법 행동을 선택한다", () => {
  const game = createGame(players(2), "BOT-LEVELS");
  const legal = legalBotActions(game, "p0");
  assert.ok(legal.length > 0);
  Object.keys(BOT_LEVELS).forEach((level) => {
    const action = chooseBotAction(game, "p0", level, () => 0.25);
    assert.ok(action);
    assert.ok(legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action)));
    assert.doesNotThrow(() => applyAction(game, "p0", action));
  });
});

test("한 턴은 30초이며 시간 초과 시 합법 행동으로 자동 진행된다", () => {
  const game = createGame(players(2), "TURN-TIMER");
  assert.ok(game.turnDeadline - game.turnStartedAt === 30_000);
  const next = playTimedTurn(game, "p0", () => 0);
  assert.equal(next.turn, 1);
  assert.match(next.log[0], /30초/);
  assert.ok(next.turnDeadline >= game.turnDeadline);
});

test("더미에서 예약한 카드만 비공개로 표시된다", () => {
  let game = createGame(players(2), "SECRET");
  game = applyAction(game, "p0", { type: "reserve", source: "2" });
  game = applyAction(game, "p1", { type: "reserve", source: "1", cardId: game.board[1][0].id });
  assert.equal(game.players[0].reserved[0].secret, true);
  assert.equal(game.players[1].reserved[0].secret, undefined);
});

test("플레이어별 화면은 더미 내용과 남이 더미에서 예약한 카드를 숨긴다", () => {
  let game = createGame(players(2), "VIEW");
  game = applyAction(game, "p0", { type: "reserve", source: "3" });
  const mine = viewFor(game, "p0");
  const theirs = viewFor(game, "p1");
  assert.equal(mine.players[0].reserved[0].cost !== undefined, true);
  assert.deepEqual(Object.keys(theirs.players[0].reserved[0]).sort(), ["id", "secret", "tier"]);
  assert.equal(theirs.decks[3].length, game.decks[3].length);
  assert.ok(theirs.decks[3].every((card) => card === null));
  assert.ok(JSON.stringify(theirs).length < JSON.stringify(game).length / 2);
});
