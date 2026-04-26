import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { WebSocket, type RawData } from "ws";
import type { SignalingMessage } from "@phone-monitor/shared";
import { RoomStore } from "../src/store.js";
import { createSignalingServer } from "../src/ws.js";

function createStore(): RoomStore {
  return new RoomStore({
    publicHttpUrl: "https://monitor.local",
    roomTtlMs: 60000,
    pinMaxAttempts: 2,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    now: () => 1000
  });
}

async function startSignalingServer(store: RoomStore): Promise<{
  wsUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer();
  createSignalingServer(server, store);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    wsUrl: `ws://127.0.0.1:${address.port}/ws`,
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

function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function send(socket: WebSocket, message: SignalingMessage): void {
  socket.send(JSON.stringify(message));
}

function nextMessage(socket: WebSocket): Promise<SignalingMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 1000);

    socket.once("message", (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()) as SignalingMessage);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function expectNoMessage(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, 150);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onMessage = (raw: RawData): void => {
      cleanup();
      reject(
        new Error(`Expected no WebSocket message, received ${raw.toString()}`)
      );
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (
    socket.readyState === WebSocket.CLOSING ||
    socket.readyState === WebSocket.CLOSED
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function verifyPinAfterViewerRelease(
  store: RoomStore,
  roomId: string,
  pin: string
) {
  const deadline = Date.now() + 1000;

  while (true) {
    try {
      return store.verifyPin(roomId, pin);
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await wait(10);
    }
  }
}

test("routes viewer joins and WebRTC messages between paired peers", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const camera = await openSocket(app.wsUrl);
  const viewer = await openSocket(app.wsUrl);

  try {
    send(camera, { type: "join-camera", roomId: room.roomId });
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });

    const viewerJoin = await nextMessage(camera);
    assert.equal(viewerJoin.type, "join-viewer");

    const offer: SignalingMessage = {
      type: "offer",
      roomId: room.roomId,
      sdp: { type: "offer", sdp: "v=0\r\n" }
    };
    send(camera, offer);
    assert.deepEqual(await nextMessage(viewer), offer);

    const answer: SignalingMessage = {
      type: "answer",
      roomId: room.roomId,
      sdp: { type: "answer", sdp: "v=0\r\n" }
    };
    send(viewer, answer);
    assert.deepEqual(await nextMessage(camera), answer);
  } finally {
    await Promise.all([closeSocket(camera), closeSocket(viewer)]);
    await app.close();
  }
});

test("notifies a camera when a verified viewer is already waiting", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const viewer = await openSocket(app.wsUrl);
  const camera = await openSocket(app.wsUrl);

  try {
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });
    send(camera, { type: "join-camera", roomId: room.roomId });

    const message = await nextMessage(camera);
    assert.equal(message.type, "join-viewer");
    assert.equal(message.roomId, room.roomId);
  } finally {
    await Promise.all([closeSocket(camera), closeSocket(viewer)]);
    await app.close();
  }
});

test("rejects duplicate joins while preserving viewer cleanup", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const viewer = await openSocket(app.wsUrl);
  const replacementViewer = await openSocket(app.wsUrl);
  const camera = await openSocket(app.wsUrl);

  try {
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });

    send(viewer, { type: "join-camera", roomId: room.roomId });
    assert.deepEqual(await nextMessage(viewer), {
      type: "error",
      code: "ALREADY_JOINED",
      message: "Socket already joined a room"
    });

    await closeSocket(viewer);

    const replacementVerified = await verifyPinAfterViewerRelease(
      store,
      room.roomId,
      room.pin
    );
    send(replacementViewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: replacementVerified.viewerToken
    });
    send(camera, { type: "join-camera", roomId: room.roomId });

    assert.deepEqual(await nextMessage(camera), {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: replacementVerified.viewerToken
    });
  } finally {
    await Promise.all([
      closeSocket(camera),
      closeSocket(replacementViewer),
      closeSocket(viewer)
    ]);
    await app.close();
  }
});

test("rejects a viewer without a valid admission token", async () => {
  const store = createStore();
  const room = store.createRoom();
  const app = await startSignalingServer(store);
  const viewer = await openSocket(app.wsUrl);

  try {
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: "bad-token"
    });

    const message = await nextMessage(viewer);
    assert.deepEqual(message, {
      type: "error",
      code: "VIEWER_REJECTED",
      message: "Viewer token rejected"
    });
  } finally {
    await closeSocket(viewer);
    await app.close();
  }
});

test("requires clients to join a room before sending WebRTC messages", async () => {
  const store = createStore();
  const app = await startSignalingServer(store);
  const socket = await openSocket(app.wsUrl);

  try {
    send(socket, {
      type: "ice-candidate",
      roomId: "room-1",
      candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" }
    });

    const message = await nextMessage(socket);
    assert.deepEqual(message, {
      type: "error",
      code: "JOIN_REQUIRED",
      message: "Join a room before signaling"
    });
  } finally {
    await closeSocket(socket);
    await app.close();
  }
});

test("rejects room-mismatched signaling after join without forwarding it", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const camera = await openSocket(app.wsUrl);
  const viewer = await openSocket(app.wsUrl);

  try {
    send(camera, { type: "join-camera", roomId: room.roomId });
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });
    await nextMessage(camera);

    send(viewer, {
      type: "offer",
      roomId: "different-room",
      sdp: { type: "offer", sdp: "v=0\r\n" }
    });

    assert.deepEqual(await nextMessage(viewer), {
      type: "error",
      code: "ROOM_MISMATCH",
      message: "Message room does not match joined room"
    });
    await expectNoMessage(camera);
  } finally {
    await Promise.all([closeSocket(camera), closeSocket(viewer)]);
    await app.close();
  }
});

test("rejects client-supplied peer-left and error messages without forwarding them", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const camera = await openSocket(app.wsUrl);
  const viewer = await openSocket(app.wsUrl);

  try {
    send(camera, { type: "join-camera", roomId: room.roomId });
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });
    await nextMessage(camera);

    send(viewer, {
      type: "peer-left",
      roomId: room.roomId,
      role: "camera"
    });
    assert.deepEqual(await nextMessage(viewer), {
      type: "error",
      code: "FORBIDDEN_MESSAGE",
      message: "Message type cannot be sent by clients"
    });
    await expectNoMessage(camera);

    send(viewer, {
      type: "error",
      code: "SPOOFED",
      message: "spoofed server error"
    });
    assert.deepEqual(await nextMessage(viewer), {
      type: "error",
      code: "FORBIDDEN_MESSAGE",
      message: "Message type cannot be sent by clients"
    });
    await expectNoMessage(camera);
  } finally {
    await Promise.all([closeSocket(camera), closeSocket(viewer)]);
    await app.close();
  }
});

test("forwards room-matched session-ended messages from joined peers", async () => {
  const store = createStore();
  const room = store.createRoom();
  const verified = store.verifyPin(room.roomId, room.pin);
  const app = await startSignalingServer(store);
  const camera = await openSocket(app.wsUrl);
  const viewer = await openSocket(app.wsUrl);

  try {
    send(camera, { type: "join-camera", roomId: room.roomId });
    send(viewer, {
      type: "join-viewer",
      roomId: room.roomId,
      viewerToken: verified.viewerToken
    });
    await nextMessage(camera);

    const ended: SignalingMessage = {
      type: "session-ended",
      roomId: room.roomId,
      reason: "viewer-ended"
    };
    send(viewer, ended);

    assert.deepEqual(await nextMessage(camera), ended);
  } finally {
    await Promise.all([closeSocket(camera), closeSocket(viewer)]);
    await app.close();
  }
});

test("rejects malformed WebSocket messages without closing the socket", async () => {
  const store = createStore();
  const app = await startSignalingServer(store);
  const socket = await openSocket(app.wsUrl);

  try {
    socket.send("{not-json");

    const malformedMessage = await nextMessage(socket);
    assert.deepEqual(malformedMessage, {
      type: "error",
      code: "BAD_MESSAGE",
      message: "Message must match the signaling protocol"
    });

    socket.send(JSON.stringify({ type: "not-a-signaling-message" }));

    const unknownMessage = await nextMessage(socket);
    assert.deepEqual(unknownMessage, {
      type: "error",
      code: "BAD_MESSAGE",
      message: "Message must match the signaling protocol"
    });
  } finally {
    await closeSocket(socket);
    await app.close();
  }
});
