import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { handleHttp } from "./http.js";
import { RoomStore } from "./store.js";
import { createSignalingServer } from "./ws.js";

const config = loadConfig(process.env);
const store = new RoomStore({
  publicHttpUrl: config.publicHttpUrl,
  roomTtlMs: config.roomTtlMs,
  pinMaxAttempts: config.pinMaxAttempts,
  iceServers: config.iceServers,
  now: () => Date.now()
});

const server = createServer((req, res) => {
  void handleHttp(req, res, store);
});

createSignalingServer(server, store);

server.listen(config.port, config.host, () => {
  console.log(`signaling server listening on ${config.host}:${config.port}`);
});
