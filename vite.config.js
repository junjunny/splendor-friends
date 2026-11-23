import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createMemoryRoomStore } from "./src/server/room-store.js";
import { createRoomService } from "./src/server/room-service.js";
import { dispatchRoomRequest } from "./src/server/http-controller.js";

function localRoomsApi() {
  const service = createRoomService(createMemoryRoomStore());
  const install = (middlewares) => {
    middlewares.use("/api/rooms", async (request, response) => {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; }
      catch { body = {}; }
      const host = request.headers.host || "localhost";
      const result = await dispatchRoomRequest(service, {
        method: request.method,
        url: `http://${host}${request.url || ""}`,
        body,
      });
      response.statusCode = result.status;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(result.body));
    });
  };
  return {
    name: "local-rooms-api",
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}

export default defineConfig({
  plugins: [react(), localRoomsApi()],
});
