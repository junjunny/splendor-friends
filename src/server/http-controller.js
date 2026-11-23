import { serializeRoomError } from "./room-service.js";

const allowedPostOperations = new Set(["create", "join", "sync", "start", "action", "rematch", "emote", "heartbeat", "leave"]);

export async function dispatchRoomRequest(service, { method, url, body = {} }) {
  try {
    if (method === "GET") {
      const parsed = new URL(url, "http://localhost");
      const code = parsed.searchParams.get("code");
      if (!code) return { status: 200, body: await service.health() };
      const result = await service.sync({
        code,
        playerId: parsed.searchParams.get("playerId"),
        sessionToken: parsed.searchParams.get("token"),
      });
      return { status: 200, body: result };
    }
    if (method !== "POST") return { status: 405, body: { error: "지원하지 않는 요청이에요.", code: "METHOD_NOT_ALLOWED" } };
    if (!allowedPostOperations.has(body?.op)) return { status: 400, body: { error: "알 수 없는 방 요청이에요.", code: "UNKNOWN_OPERATION" } };
    if (body.op === "create") return { status: 201, body: await service.create(body.profile) };
    if (body.op === "join") return { status: 200, body: await service.join(body) };
    if (body.op === "sync") return { status: 200, body: await service.sync(body) };
    if (body.op === "start") return { status: 200, body: await service.start(body) };
    if (body.op === "action") return { status: 200, body: await service.action(body) };
    if (body.op === "rematch") return { status: 200, body: await service.rematch(body) };
    if (body.op === "emote") return { status: 200, body: await service.emote(body) };
    if (body.op === "heartbeat") return { status: 200, body: await service.heartbeat(body) };
    return { status: 200, body: await service.leave(body) };
  } catch (error) {
    return serializeRoomError(error);
  }
}
