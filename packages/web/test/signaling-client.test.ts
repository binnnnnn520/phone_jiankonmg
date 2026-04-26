import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage } from "@phone-monitor/shared";
import { SignalingClient, type BrowserSocket } from "../src/signaling-client.js";

class FakeSocket implements BrowserSocket {
  readonly sent: string[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open(): void {
    this.readyState = 1;
    this.emit("open", new Event("open"));
  }

  send(message: string): void {
    this.sent.push(message);
  }
}

test("SignalingClient resolves connect on socket open and sends JSON messages", async () => {
  const socket = new FakeSocket();
  const client = new SignalingClient("wss://signal.example/ws", (url: string) => {
    assert.equal(url, "wss://signal.example/ws");
    return socket;
  });

  const connected = client.connect();
  socket.open();
  await connected;

  client.send({
    type: "join-camera",
    roomId: "room-1",
    cameraToken: "camera-token"
  });
  assert.deepEqual(socket.sent, [
    JSON.stringify({
      type: "join-camera",
      roomId: "room-1",
      cameraToken: "camera-token"
    })
  ]);
});

test("SignalingClient dispatches parsed signaling messages to listeners", async () => {
  const socket = new FakeSocket();
  const client = new SignalingClient("wss://signal.example/ws", () => socket);
  const seen: unknown[] = [];
  client.onMessage((message: SignalingMessage) => seen.push(message));

  const connected = client.connect();
  socket.open();
  await connected;
  socket.emit(
    "message",
    new MessageEvent("message", {
      data: JSON.stringify({ type: "peer-left", roomId: "room-1", role: "viewer" })
    })
  );

  assert.deepEqual(seen, [{ type: "peer-left", roomId: "room-1", role: "viewer" }]);
});

test("SignalingClient refuses to send before the socket is open", () => {
  const client = new SignalingClient("wss://signal.example/ws", () => new FakeSocket());

  assert.throws(
    () =>
      client.send({
        type: "join-camera",
        roomId: "room-1",
        cameraToken: "camera-token"
      }),
    /socket is not open/
  );
});
