import { Redis } from "@upstash/redis";

const ROOM_PREFIX = "splendor:room:";
const PRESENCE_PREFIX = "splendor:presence:";

function redisClient() {
  const hasUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const hasToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!hasUrl || !hasToken) {
    throw new Error("Upstash Redis REST environment variables are required");
  }
  return Redis.fromEnv({ automaticDeserialization: false });
}

export function createUpstashRoomStore() {
  const redis = redisClient();
  const roomKey = (code) => `${ROOM_PREFIX}${code}`;
  const presenceKey = (code, playerId) => `${PRESENCE_PREFIX}${code}:${playerId}`;

  return {
    kind: "upstash-redis",
    async createRoom(code, version, record, ttlSeconds) {
      const created = await redis.set(roomKey(code), JSON.stringify({ version, record }), { nx: true, ex: ttlSeconds });
      return created === "OK";
    },
    async getRoom(code) {
      const raw = await redis.get(roomKey(code));
      return raw ? JSON.parse(raw) : null;
    },
    async compareAndSetRoom(code, expectedVersion, nextVersion, record, ttlSeconds) {
      const script = `
        local raw = redis.call('GET', KEYS[1])
        if not raw then return 0 end
        local current = cjson.decode(raw)
        if tonumber(current.version) ~= tonumber(ARGV[1]) then return 0 end
        redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
        return 1
      `;
      const result = await redis.eval(script, [roomKey(code)], [expectedVersion, JSON.stringify({ version: nextVersion, record }), ttlSeconds]);
      return Number(result) === 1;
    },
    async deleteRoom(code) { await redis.del(roomKey(code)); },
    async markPresence(code, playerId, ttlSeconds) {
      await redis.set(presenceKey(code, playerId), "1", { ex: ttlSeconds });
    },
    async removePresence(code, playerId) { await redis.del(presenceKey(code, playerId)); },
    async getPresence(code, playerIds) {
      if (!playerIds.length) return {};
      const values = await redis.mget(...playerIds.map((playerId) => presenceKey(code, playerId)));
      return Object.fromEntries(playerIds.map((playerId, index) => [playerId, values[index] !== null]));
    },
  };
}
