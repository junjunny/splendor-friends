import { createHash, randomBytes } from "node:crypto";
import { applyAction, createGame, viewFor } from "../game.js";
import { playTimedTurn } from "../bot.js";
import { EMOTES } from "../mascots.js";

export const ROOM_TTL_SECONDS = 12 * 60 * 60;
export const PRESENCE_TTL_SECONDS = 35;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VALID_AVATARS = new Set(["chiikawa", "hachiware", "usagi", "kurimanju", "ode", "momonga"]);

function roomError(message, status = 400, code = "BAD_REQUEST") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function createRoomCode(random = Math.random) {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join("");
}

function cleanProfile(profile) {
  const id = String(profile?.id || "").trim().slice(0, 80);
  const name = String(profile?.name || "").trim().slice(0, 10);
  const avatar = VALID_AVATARS.has(profile?.avatar) ? profile.avatar : "chiikawa";
  if (!id || !name) throw roomError("플레이어 이름을 확인해주세요.");
  return { id, name, avatar };
}

function cleanCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw roomError("5자리 방 코드를 확인해주세요.");
  return code;
}

function authenticate(record, playerId, token) {
  const expected = record.sessions?.[playerId];
  if (!expected || !token || expected !== tokenHash(token)) {
    throw roomError("이 방의 참가 인증이 만료됐어요. 방 코드를 다시 입력해주세요.", 401, "SESSION_EXPIRED");
  }
}

function publicState(record, version, presence = {}, viewerId = "") {
  const connectedPlayers = record.players.map((player) => ({ ...player, connected: Boolean(presence[player.id]) }));
  const connectedById = Object.fromEntries(connectedPlayers.map((player) => [player.id, player.connected]));
  const gameView = record.game ? viewFor(record.game, viewerId) : null;
  const game = gameView ? {
    ...gameView,
    players: gameView.players.map((player) => ({
      ...player,
      connected: Boolean(connectedById[player.id]),
    })),
  } : null;
  return {
    version,
    serverTime: Date.now(),
    lobby: {
      roomCode: record.roomCode,
      status: record.status,
      hostId: record.hostId,
      players: connectedPlayers,
    },
    game,
    emote: record.emote || null,
  };
}

function rememberAction(record, actionId) {
  record.processedActionIds = [actionId, ...(record.processedActionIds || [])].slice(0, 40);
}

async function loadAuthorized(store, codeInput, playerId, token) {
  const code = cleanCode(codeInput);
  const snapshot = await store.getRoom(code);
  if (!snapshot) throw roomError("방을 찾을 수 없어요. 코드가 맞는지 확인해주세요.", 404, "ROOM_NOT_FOUND");
  authenticate(snapshot.record, playerId, token);
  return { code, ...snapshot };
}

async function withPresence(store, snapshot, viewerId) {
  const presence = await store.getPresence(snapshot.record.roomCode, snapshot.record.players.map((player) => player.id));
  return publicState(snapshot.record, snapshot.version, presence, viewerId);
}

async function commit(store, code, snapshot, nextRecord) {
  nextRecord.updatedAt = Date.now();
  const nextVersion = snapshot.version + 1;
  const committed = await store.compareAndSetRoom(code, snapshot.version, nextVersion, nextRecord, ROOM_TTL_SECONDS);
  if (!committed) throw roomError("다른 행동이 먼저 반영됐어요. 최신 상태로 다시 시도해주세요.", 409, "VERSION_CONFLICT");
  return { record: nextRecord, version: nextVersion };
}

async function advanceExpiredTurn(store, code, snapshot) {
  const game = snapshot.record.game;
  if (!game || game.status !== "playing" || !game.turnDeadline || game.turnDeadline > Date.now()) return snapshot;
  const timedOutPlayer = game.players[game.turn];
  if (!timedOutPlayer) return snapshot;
  const nextRecord = structuredClone(snapshot.record);
  nextRecord.game = playTimedTurn(nextRecord.game, timedOutPlayer.id);
  try {
    return await commit(store, code, snapshot, nextRecord);
  } catch (error) {
    if (error.code !== "VERSION_CONFLICT") throw error;
    return (await store.getRoom(code)) || snapshot;
  }
}

export function createRoomService(store) {
  if (!store) throw new Error("Room store is required");

  return {
    async create(profileInput) {
      const profile = cleanProfile(profileInput);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const roomCode = createRoomCode();
        const sessionToken = createSessionToken();
        const now = Date.now();
        const record = {
          roomCode,
          status: "waiting",
          hostId: profile.id,
          players: [profile],
          sessions: { [profile.id]: tokenHash(sessionToken) },
          game: null,
          emote: null,
          emoteAt: {},
          processedActionIds: [],
          createdAt: now,
          updatedAt: now,
        };
        if (await store.createRoom(roomCode, 1, record, ROOM_TTL_SECONDS)) {
          await store.markPresence(roomCode, profile.id, PRESENCE_TTL_SECONDS);
          return { sessionToken, ...(await withPresence(store, { record, version: 1 }, profile.id)) };
        }
      }
      throw roomError("방 코드를 만들지 못했어요. 잠시 후 다시 시도해주세요.", 503, "ROOM_CODE_EXHAUSTED");
    },

    async join({ code: codeInput, profile: profileInput, sessionToken = "" }) {
      const code = cleanCode(codeInput);
      const profile = cleanProfile(profileInput);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = await store.getRoom(code);
        if (!snapshot) throw roomError("방을 찾을 수 없어요. 코드가 맞는지 확인해주세요.", 404, "ROOM_NOT_FOUND");
        const existing = snapshot.record.players.find((player) => player.id === profile.id);
        if (existing) {
          authenticate(snapshot.record, profile.id, sessionToken);
          await store.markPresence(code, profile.id, PRESENCE_TTL_SECONDS);
          return { sessionToken, ...(await withPresence(store, snapshot, profile.id)) };
        }
        if (snapshot.record.status !== "waiting") throw roomError("이미 게임이 시작된 방이에요.", 409, "GAME_STARTED");
        if (snapshot.record.players.length >= 4) throw roomError("방이 가득 찼어요.", 409, "ROOM_FULL");
        const nextToken = createSessionToken();
        const nextRecord = structuredClone(snapshot.record);
        nextRecord.players.push(profile);
        nextRecord.sessions[profile.id] = tokenHash(nextToken);
        try {
          const committed = await commit(store, code, snapshot, nextRecord);
          await store.markPresence(code, profile.id, PRESENCE_TTL_SECONDS);
          return { sessionToken: nextToken, ...(await withPresence(store, committed, profile.id)) };
        } catch (error) {
          if (error.code !== "VERSION_CONFLICT") throw error;
        }
      }
      throw roomError("여러 친구가 동시에 입장했어요. 한 번만 다시 눌러주세요.", 409, "JOIN_CONFLICT");
    },

    async sync({ code: codeInput, playerId, sessionToken, knownVersion = 0 }) {
      let snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      snapshot = await advanceExpiredTurn(store, snapshot.code, snapshot);
      if (Number(knownVersion) === snapshot.version) {
        return { unchanged: true, version: snapshot.version, serverTime: Date.now() };
      }
      return withPresence(store, snapshot, playerId);
    },

    async start({ code: codeInput, playerId, sessionToken }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      if (snapshot.record.hostId !== playerId) throw roomError("방장만 게임을 시작할 수 있어요.", 403, "HOST_ONLY");
      if (snapshot.record.status !== "waiting") return withPresence(store, snapshot, playerId);
      if (snapshot.record.players.length < 2) throw roomError("친구가 한 명 이상 들어와야 시작할 수 있어요.");
      const nextRecord = structuredClone(snapshot.record);
      nextRecord.status = "playing";
      nextRecord.game = createGame(nextRecord.players, snapshot.code);
      return withPresence(store, await commit(store, snapshot.code, snapshot, nextRecord), playerId);
    },

    async action({ code: codeInput, playerId, sessionToken, action, actionId }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      if (!actionId || typeof actionId !== "string" || actionId.length > 100) throw roomError("행동 식별자가 필요해요.");
      if (snapshot.record.processedActionIds?.includes(actionId)) return withPresence(store, snapshot, playerId);
      if (snapshot.record.status !== "playing" || !snapshot.record.game) throw roomError("아직 게임이 시작되지 않았어요.", 409, "GAME_NOT_STARTED");
      const nextRecord = structuredClone(snapshot.record);
      try {
        nextRecord.game = applyAction(nextRecord.game, playerId, action || {});
      } catch (error) {
        throw roomError(error instanceof Error ? error.message : "선택한 행동을 진행할 수 없어요.", 400, "INVALID_ACTION");
      }
      rememberAction(nextRecord, actionId);
      return withPresence(store, await commit(store, snapshot.code, snapshot, nextRecord), playerId);
    },

    async rematch({ code: codeInput, playerId, sessionToken }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      if (snapshot.record.hostId !== playerId) throw roomError("방장만 다시 시작할 수 있어요.", 403, "HOST_ONLY");
      if (snapshot.record.game?.status !== "finished") throw roomError("게임이 끝난 뒤 다시 시작할 수 있어요.", 409, "GAME_NOT_FINISHED");
      const nextRecord = structuredClone(snapshot.record);
      nextRecord.players = [...nextRecord.players.slice(1), nextRecord.players[0]];
      nextRecord.game = createGame(nextRecord.players, snapshot.code, `${snapshot.code}-${Date.now()}`);
      nextRecord.emote = null;
      return withPresence(store, await commit(store, snapshot.code, snapshot, nextRecord), playerId);
    },

    async emote({ code: codeInput, playerId, sessionToken, key, emoteId = "" }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      if (!EMOTES.some((item) => item.key === key)) throw roomError("알 수 없는 감정표현이에요.");
      const lastAt = snapshot.record.emoteAt?.[playerId] || 0;
      if (Date.now() - lastAt < 800) return withPresence(store, snapshot, playerId);
      const nextRecord = structuredClone(snapshot.record);
      nextRecord.emoteAt = { ...(nextRecord.emoteAt || {}), [playerId]: Date.now() };
      nextRecord.emote = { id: typeof emoteId === "string" && emoteId.length <= 100 && emoteId ? emoteId : `${Date.now()}-${playerId}`, playerId, key };
      return withPresence(store, await commit(store, snapshot.code, snapshot, nextRecord), playerId);
    },

    async heartbeat({ code: codeInput, playerId, sessionToken }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      await store.markPresence(snapshot.code, playerId, PRESENCE_TTL_SECONDS);
      return { ok: true, serverTime: Date.now(), version: snapshot.version };
    },

    async leave({ code: codeInput, playerId, sessionToken }) {
      const snapshot = await loadAuthorized(store, codeInput, playerId, sessionToken);
      await store.removePresence(snapshot.code, playerId);
      if (snapshot.record.status !== "waiting") return { ok: true };
      const nextRecord = structuredClone(snapshot.record);
      nextRecord.players = nextRecord.players.filter((player) => player.id !== playerId);
      delete nextRecord.sessions[playerId];
      if (!nextRecord.players.length) {
        await store.deleteRoom(snapshot.code);
        return { ok: true, deleted: true };
      }
      if (nextRecord.hostId === playerId) nextRecord.hostId = nextRecord.players[0].id;
      await commit(store, snapshot.code, snapshot, nextRecord);
      return { ok: true };
    },

    async health() {
      return { ok: true, architecture: "authoritative-server", persistence: store.kind || "unknown", maxPlayers: 4 };
    },
  };
}

export function serializeRoomError(error) {
  const known = Number.isInteger(error?.status);
  if (!known) console.error("[rooms] unexpected error", error);
  return {
    status: known ? error.status : 500,
    body: {
      error: known ? error.message : "서버에서 방을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
      code: known ? error.code : "INTERNAL_ERROR",
    },
  };
}
