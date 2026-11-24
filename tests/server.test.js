import test from "node:test";
import assert from "node:assert/strict";
import { createRoomService } from "../src/server/room-service.js";
import { createMemoryRoomStore } from "../src/server/room-store.js";

const profile = (index) => ({ id: `server-player-${index}`, name: `서버친구${index}`, avatar: ["chiikawa", "hachiware", "usagi", "ode"][index - 1] || "momonga" });

async function makeFourPlayerRoom() {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const host = await service.create(profile(1));
  const sessions = [{ profile: profile(1), token: host.sessionToken }];
  for (let index = 2; index <= 4; index += 1) {
    const joined = await service.join({ code: host.lobby.roomCode, profile: profile(index) });
    sessions.push({ profile: profile(index), token: joined.sessionToken });
  }
  return { store, service, host, sessions };
}

async function finishRoom(store, service, code, session) {
  const snapshot = await store.getRoom(code);
  snapshot.record.game.status = "finished";
  await store.compareAndSetRoom(code, snapshot.version, snapshot.version + 1, snapshot.record, 3600);
  return service.sync({ code, playerId: session.profile.id, sessionToken: session.token, knownVersion: 0, knownGameVersion: 0 });
}

test("권위 서버가 4명 참가와 4인용 공급처를 안정적으로 만든다", async () => {
  const { service, host, sessions } = await makeFourPlayerRoom();
  const started = await service.start({ code: host.lobby.roomCode, playerId: sessions[0].profile.id, sessionToken: sessions[0].token });
  assert.equal(started.lobby.players.length, 4);
  assert.equal(started.game.players.length, 4);
  assert.equal(started.game.nobles.length, 5);
  Object.values(started.game.supply).slice(0, 5).forEach((count) => assert.equal(count, 7));
  await assert.rejects(
    service.join({ code: host.lobby.roomCode, profile: profile(5) }),
    (error) => error.code === "GAME_STARTED",
  );
});

test("같은 Redis 저장소를 쓰는 새 서버 인스턴스에서도 참가 세션을 복구한다", async () => {
  const store = createMemoryRoomStore();
  const firstServer = createRoomService(store);
  const created = await firstServer.create(profile(1));
  const restartedServer = createRoomService(store);
  const resumed = await restartedServer.join({ code: created.lobby.roomCode, profile: profile(1), sessionToken: created.sessionToken });
  assert.equal(resumed.lobby.roomCode, created.lobby.roomCode);
  assert.equal(resumed.lobby.hostId, profile(1).id);
  assert.equal(resumed.lobby.players.length, 1);
});

test("세 명이 동시에 입장해도 낙관적 충돌을 서버에서 재시도해 네 자리를 모두 채운다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const joined = await Promise.all([2, 3, 4].map((index) => service.join({ code: created.lobby.roomCode, profile: profile(index) })));
  assert.equal(joined.length, 3);
  const view = await service.sync({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  assert.equal(view.lobby.players.length, 4);
  assert.equal(new Set(view.lobby.players.map((player) => player.id)).size, 4);
});

test("동시에 도착한 중복 행동은 한 번만 반영하고 이후 상태가 일치한다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  const request = {
    code: created.lobby.roomCode,
    playerId: profile(1).id,
    sessionToken: created.sessionToken,
    actionId: "same-mobile-tap",
    action: { type: "take", colors: ["white", "blue", "green"] },
  };
  const first = await service.action(request);
  const duplicate = await service.action(request);
  assert.equal(duplicate.version, first.version);
  assert.equal(duplicate.game.turn, 1);
  assert.equal(duplicate.game.players[0].tokens.white, 1);
  const guestView = await service.sync({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken });
  assert.deepEqual(guestView.game, duplicate.game);
});

test("서버가 30초 만료를 판정해 방장 접속 여부와 무관하게 턴을 넘긴다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  const snapshot = await store.getRoom(created.lobby.roomCode);
  snapshot.record.game.turnDeadline = Date.now() - 1;
  await store.compareAndSetRoom(created.lobby.roomCode, snapshot.version, snapshot.version + 1, snapshot.record, 3600);
  const afterTimeout = await service.sync({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken });
  assert.equal(afterTimeout.game.turn, 1);
  assert.match(afterTimeout.game.log[0], /30초/);
});

test("잘못된 참가 토큰으로는 방 상태나 행동에 접근할 수 없다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  await assert.rejects(
    service.sync({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: "wrong-token" }),
    (error) => error.status === 401 && error.code === "SESSION_EXPIRED",
  );
});

test("차례가 아닌 플레이어의 요청은 서버에서 거부해 상태를 바꾸지 않는다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  const started = await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await assert.rejects(
    service.action({
      code: created.lobby.roomCode,
      playerId: profile(2).id,
      sessionToken: guest.sessionToken,
      actionId: "out-of-turn",
      action: { type: "take", colors: ["white", "blue", "green"] },
    }),
    (error) => error.status === 400 && error.code === "INVALID_ACTION",
  );
  const current = await service.sync({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  assert.equal(current.version, started.version);
  assert.equal(current.game.turn, 0);
});

test("감정표현과 같은 방 다시하기도 서버를 통해 모든 참가자에게 동기화된다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  const reacted = await service.emote({
    code: created.lobby.roomCode,
    playerId: profile(2).id,
    sessionToken: guest.sessionToken,
    key: "hello",
    emoteId: "shared-emote",
  });
  assert.deepEqual({ ...reacted.emote, expiresAt: undefined }, { id: "shared-emote", playerId: profile(2).id, key: "hello", expiresAt: undefined });
  assert.ok(reacted.emote.expiresAt > Date.now());
  await finishRoom(store, service, created.lobby.roomCode, { profile: profile(1), token: created.sessionToken });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "guest-ready", ready: true });
  const rematch = await service.rematch({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken, startRequestId: "rematch-1" });
  assert.equal(rematch.game.status, "playing");
  assert.equal(rematch.game.players[0].id, profile(2).id);
  assert.equal(rematch.lobby.hostId, profile(1).id);
});

test("재경기는 일반 플레이어 전원 Ready 이후에도 방장이 눌러야 시작된다", async () => {
  const { store, service, host, sessions } = await makeFourPlayerRoom();
  const code = host.lobby.roomCode;
  await service.start({ code, playerId: sessions[0].profile.id, sessionToken: sessions[0].token });
  await finishRoom(store, service, code, sessions[0]);
  await assert.rejects(
    service.rematch({ code, playerId: sessions[0].profile.id, sessionToken: sessions[0].token, startRequestId: "too-early" }),
    (error) => error.code === "PLAYERS_NOT_READY",
  );
  for (const [index, session] of sessions.slice(1).entries()) {
    await service.status({ code, playerId: session.profile.id, sessionToken: session.token, eventId: `ready-${index}`, ready: true });
  }
  const waiting = await service.sync({ code, playerId: sessions[0].profile.id, sessionToken: sessions[0].token, knownVersion: 0, knownGameVersion: 0 });
  assert.equal(waiting.lobby.status, "rematch");
  assert.equal(waiting.game.status, "finished");
  const started = await service.rematch({ code, playerId: sessions[0].profile.id, sessionToken: sessions[0].token, startRequestId: "ready-start" });
  assert.equal(started.lobby.status, "playing");
  assert.equal(started.game.status, "playing");
  assert.equal(started.lobby.players.filter((player) => player.ready).length, 0);
});

test("Ready 취소와 재경기 시작이 겹치면 서버의 최신 상태가 우선한다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  const hostSession = { profile: profile(1), token: created.sessionToken };
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await finishRoom(store, service, created.lobby.roomCode, hostSession);
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "ready-on", ready: true });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "ready-off", ready: false });
  await assert.rejects(
    service.rematch({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken, startRequestId: "after-cancel" }),
    (error) => error.code === "PLAYERS_NOT_READY",
  );
});

test("잠시만·여기까지·다음 판 막판은 Ready와 독립된 서버 상태로 동기화된다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await finishRoom(store, service, created.lobby.roomCode, { profile: profile(1), token: created.sessionToken });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "ready-first", ready: true });
  const wait = await service.emote({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, key: "wait", emoteId: "wait-chat" });
  assert.equal(wait.lobby.players[1].ready, false);
  assert.equal(wait.lobby.players[1].waiting, true);
  const snapshot = await store.getRoom(created.lobby.roomCode);
  snapshot.record.emoteAt[profile(2).id] = 0;
  await store.compareAndSetRoom(created.lobby.roomCode, snapshot.version, snapshot.version + 1, snapshot.record, 3600);
  const last = await service.emote({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, key: "last_next", emoteId: "last-chat" });
  assert.equal(last.lobby.players[1].lastGamePending, true);
  assert.equal(last.lobby.players[1].ready, false);
  const afterReady = await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "ready-again", ready: true });
  assert.equal(afterReady.lobby.players[1].lastGamePending, true);
  assert.equal(afterReady.lobby.players[1].waiting, false);
});

test("현재 판 막판은 취소 가능하며 지정한 다음 판에만 적용된다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  const started = await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  const set = await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "last-current", lastGameCurrent: true });
  assert.equal(set.lobby.players[1].lastGameRoundId, started.lobby.roundId);
  const cleared = await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "last-cancel", lastGameCurrent: false });
  assert.equal(cleared.lobby.players[1].lastGameRoundId, null);
  await finishRoom(store, service, created.lobby.roomCode, { profile: profile(1), token: created.sessionToken });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "last-next", lastGamePending: true });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "next-ready", ready: true });
  const next = await service.rematch({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken, startRequestId: "next-round" });
  assert.equal(next.lobby.players.find((player) => player.id === profile(2).id).lastGameRoundId, next.lobby.roundId);
  assert.equal(next.lobby.players.find((player) => player.id === profile(2).id).lastGamePending, false);
});

test("상태·Quick Chat 변경은 큰 게임 본문을 다시 보내지 않는다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  const started = await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, eventId: "light-status", lastGameCurrent: true });
  const delta = await service.sync({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken, knownVersion: started.version, knownGameVersion: started.gameVersion });
  assert.equal(Object.hasOwn(delta, "game"), false);
  assert.equal(delta.lobby.players[1].lastGameRoundId, started.lobby.roundId);
});

test("재경기 대기실 퇴장은 즉시 인원에서 빠지고 방장 권한이 이전된다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await finishRoom(store, service, created.lobby.roomCode, { profile: profile(1), token: created.sessionToken });
  await service.leave({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  const remaining = await service.sync({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, knownVersion: 0, knownGameVersion: -1 });
  assert.equal(remaining.lobby.players.length, 1);
  assert.equal(remaining.lobby.hostId, profile(2).id);
});

test("방장이 아닌 플레이어와 미인증 요청은 Ready 조건을 우회할 수 없다", async () => {
  const store = createMemoryRoomStore();
  const service = createRoomService(store);
  const created = await service.create(profile(1));
  const guest = await service.join({ code: created.lobby.roomCode, profile: profile(2) });
  await service.start({ code: created.lobby.roomCode, playerId: profile(1).id, sessionToken: created.sessionToken });
  await finishRoom(store, service, created.lobby.roomCode, { profile: profile(1), token: created.sessionToken });
  await assert.rejects(
    service.rematch({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: guest.sessionToken, startRequestId: "guest-start" }),
    (error) => error.code === "HOST_ONLY",
  );
  await assert.rejects(
    service.status({ code: created.lobby.roomCode, playerId: profile(2).id, sessionToken: "wrong", eventId: "forged", ready: true }),
    (error) => error.code === "SESSION_EXPIRED",
  );
});
