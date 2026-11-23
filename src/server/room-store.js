export function createMemoryRoomStore() {
  const rooms = new Map();
  const presence = new Map();

  const activeRoom = (code) => {
    const item = rooms.get(code);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      rooms.delete(code);
      return null;
    }
    return item;
  };

  return {
    kind: "memory",
    async createRoom(code, version, record, ttlSeconds) {
      if (activeRoom(code)) return false;
      rooms.set(code, { version, record: structuredClone(record), expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async getRoom(code) {
      const item = activeRoom(code);
      return item ? { version: item.version, record: structuredClone(item.record) } : null;
    },
    async compareAndSetRoom(code, expectedVersion, nextVersion, record, ttlSeconds) {
      const item = activeRoom(code);
      if (!item || item.version !== expectedVersion) return false;
      rooms.set(code, { version: nextVersion, record: structuredClone(record), expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async deleteRoom(code) { rooms.delete(code); },
    async markPresence(code, playerId, ttlSeconds) {
      presence.set(`${code}:${playerId}`, Date.now() + ttlSeconds * 1000);
    },
    async removePresence(code, playerId) { presence.delete(`${code}:${playerId}`); },
    async getPresence(code, playerIds) {
      return Object.fromEntries(playerIds.map((playerId) => {
        const key = `${code}:${playerId}`;
        const expiresAt = presence.get(key) || 0;
        if (expiresAt <= Date.now()) presence.delete(key);
        return [playerId, expiresAt > Date.now()];
      }));
    },
  };
}
