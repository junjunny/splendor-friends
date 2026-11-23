import { createRoomService } from "../src/server/room-service.js";
import { dispatchRoomRequest } from "../src/server/http-controller.js";
import { createUpstashRoomStore } from "../src/server/upstash-room-store.js";

let service;

function getService() {
  if (!service) service = createRoomService(createUpstashRoomStore());
  return service;
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_768) throw Object.assign(new Error("요청이 너무 커요."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error("요청 형식을 확인해주세요."), { status: 400, code: "INVALID_JSON" }); }
}

export default async function handler(request, response) {
  const startedAt = Date.now();
  try {
    const host = request.headers.host || "splendor-friends.vercel.app";
    const url = new URL(request.url, `https://${host}`).toString();
    const result = await dispatchRoomRequest(getService(), {
      method: request.method,
      url,
      body: request.method === "POST" ? await readBody(request) : {},
    });
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(result.status).json(result.body);
    console.log(JSON.stringify({ event: "room_request", method: request.method, status: result.status, durationMs: Date.now() - startedAt }));
  } catch (error) {
    console.error("[rooms] handler failure", error);
    response.status(error?.status || 500).json({ error: error?.status ? error.message : "서버 요청을 처리하지 못했어요.", code: error?.code || "HANDLER_ERROR" });
  }
}
