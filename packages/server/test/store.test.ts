import assert from "node:assert/strict";
import test from "node:test";
import type { IceServerConfig } from "@phone-monitor/shared";
import { RoomStore } from "../src/store.js";

const iceServers: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" }
];

function createStore(now: () => number = () => 1000): RoomStore {
  return new RoomStore({
    publicHttpUrl: "https://monitor.local",
    roomTtlMs: 60000,
    pinMaxAttempts: 2,
    iceServers,
    now
  });
}

function wrongPinFor(pin: string): string {
  return pin === "000000" ? "111111" : "000000";
}

test("creates a short-lived room with QR payload, PIN, and ICE servers", () => {
  const room = createStore().createRoom();

  assert.match(room.roomId, /^[A-Za-z0-9_-]+$/);
  assert.match(room.pin, /^[0-9]{6}$/);
  assert.equal(room.expiresAt, 61000);
  assert.equal(
    room.qrPayload,
    `https://monitor.local/?room=${encodeURIComponent(room.roomId)}`
  );
  assert.deepEqual(room.iceServers, iceServers);
});

test("verifies a correct PIN and consumes a viewer token once", () => {
  const store = createStore();
  const room = store.createRoom();

  const result = store.verifyPin(room.roomId, room.pin);

  assert.equal(result.roomId, room.roomId);
  assert.ok(result.viewerToken.length > 20);
  assert.deepEqual(result.iceServers, iceServers);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), true);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), false);
  store.releaseViewer(room.roomId);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), false);
});

test("reserves viewer admission after the first successful PIN verification", () => {
  const store = createStore();
  const room = store.createRoom();

  const first = store.verifyPin(room.roomId, room.pin);

  assert.throws(
    () => store.verifyPin(room.roomId, room.pin),
    /VIEWER_ALREADY_RESERVED/
  );
  assert.equal(store.consumeViewerToken(room.roomId, first.viewerToken), true);
});

test("rejects an expired room and removes it from the store", () => {
  let now = 1000;
  const store = createStore(() => now);
  const room = store.createRoom();

  now = 61000;

  assert.throws(() => store.verifyPin(room.roomId, room.pin), /ROOM_EXPIRED/);
  assert.equal(store.hasRoom(room.roomId), false);
});

test("locks after repeated wrong PIN attempts", () => {
  const store = createStore();
  const room = store.createRoom();
  const wrongPin = wrongPinFor(room.pin);

  assert.throws(() => store.verifyPin(room.roomId, wrongPin), /PIN_INVALID/);
  assert.throws(() => store.verifyPin(room.roomId, wrongPin), /PIN_LOCKED/);
  assert.throws(() => store.verifyPin(room.roomId, room.pin), /PIN_LOCKED/);
});
