import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { handleHttp } from "../src/http.js";
import { RoomStore } from "../src/store.js";

function createStore(): RoomStore {
  return new RoomStore({
    publicHttpUrl: "https://monitor.local",
    roomTtlMs: 60000,
    pinMaxAttempts: 2,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    now: () => 1000
  });
}

async function startHttpServer(store: RoomStore): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    void handleHttp(req, res, store);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test("GET /health returns a JSON health response", async () => {
  const app = await startHttpServer(createStore());
  try {
    const response = await fetch(`${app.baseUrl}/health`);
    const body = (await response.json()) as { ok: boolean };

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    await app.close();
  }
});

test("POST /rooms creates a room that can be verified by PIN", async () => {
  const app = await startHttpServer(createStore());
  try {
    const createResponse = await fetch(`${app.baseUrl}/rooms`, {
      method: "POST"
    });
    const room = (await createResponse.json()) as {
      roomId: string;
      pin: string;
      cameraToken: string;
      expiresAt: number;
      qrPayload: string;
      iceServers: unknown[];
    };

    assert.equal(createResponse.status, 201);
    assert.match(room.pin, /^[0-9]{6}$/);
    assert.ok(room.cameraToken.length > 20);
    assert.equal(room.qrPayload, `https://monitor.local/?room=${room.roomId}`);
    assert.equal(room.qrPayload.includes(room.cameraToken), false);

    const verifyResponse = await fetch(`${app.baseUrl}/rooms/verify-pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: room.roomId, pin: room.pin })
    });
    const verified = (await verifyResponse.json()) as {
      roomId: string;
      viewerToken: string;
      iceServers: unknown[];
    };

    assert.equal(verifyResponse.status, 200);
    assert.equal(verified.roomId, room.roomId);
    assert.ok(verified.viewerToken.length > 20);
    assert.deepEqual(verified.iceServers, room.iceServers);
  } finally {
    await app.close();
  }
});

test("POST /rooms/verify-pin returns a code for invalid PINs", async () => {
  const app = await startHttpServer(createStore());
  try {
    const createResponse = await fetch(`${app.baseUrl}/rooms`, {
      method: "POST"
    });
    const room = (await createResponse.json()) as {
      roomId: string;
      pin: string;
    };
    const wrongPin = room.pin === "000000" ? "111111" : "000000";

    const verifyResponse = await fetch(`${app.baseUrl}/rooms/verify-pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: room.roomId, pin: wrongPin })
    });
    const body = (await verifyResponse.json()) as { code: string };

    assert.equal(verifyResponse.status, 400);
    assert.equal(body.code, "PIN_INVALID");
  } finally {
    await app.close();
  }
});
