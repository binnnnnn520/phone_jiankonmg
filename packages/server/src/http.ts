import type { IncomingMessage, ServerResponse } from "node:http";
import type { RoomStore } from "./store.js";

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

export async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  store: RoomStore
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/rooms") {
    return sendJson(res, 201, store.createRoom());
  }

  if (req.method === "POST" && url.pathname === "/rooms/verify-pin") {
    try {
      const body = await readJson<{ roomId: string; pin: string }>(req);
      return sendJson(res, 200, store.verifyPin(body.roomId, body.pin));
    } catch (error) {
      return sendJson(res, 400, {
        code: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      });
    }
  }

  sendJson(res, 404, { code: "NOT_FOUND" });
}
