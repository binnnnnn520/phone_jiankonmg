import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { IceServerConfig } from "@phone-monitor/shared";
import { RoomStore } from "../src/store.js";

const iceServers: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" }
];

function createStore(
  now: () => number = () => 1000,
  options: { viewerTokenTtlMs?: number; pairStoreFile?: string } = {}
): RoomStore {
  return new RoomStore({
    publicHttpUrl: "https://monitor.local",
    roomTtlMs: 60000,
    pinMaxAttempts: 2,
    iceServers,
    now,
    ...options
  });
}

function wrongPinFor(pin: string): string {
  return pin === "000000" ? "111111" : "000000";
}

test("creates a short-lived room with QR payload, PIN, and ICE servers", () => {
  const room = createStore().createRoom({ cameraDeviceId: "camera-device-1" });
  const { cameraToken } = room;

  assert.match(room.roomId, /^[A-Za-z0-9_-]+$/);
  assert.match(room.pin, /^[0-9]{6}$/);
  assert.ok(cameraToken);
  assert.ok(cameraToken.length > 20);
  assert.equal(room.expiresAt, 61000);
  assert.equal(
    room.qrPayload,
    `https://monitor.local/?room=${encodeURIComponent(room.roomId)}`
  );
  assert.equal(room.qrPayload.includes(cameraToken), false);
  assert.deepEqual(room.iceServers, iceServers);
  assert.equal(room.cameraPairing.cameraDeviceId, "camera-device-1");
  assert.ok(room.cameraPairing.pairId);
  assert.ok(room.cameraPairing.cameraPairToken);
});

test("persists paired camera credentials across store instances", () => {
  const directory = mkdtempSync(join(tmpdir(), "phone-monitor-pairs-"));
  const pairStoreFile = join(directory, "pairs.json");
  try {
    const firstStore = createStore(() => 1000, { pairStoreFile });
    const firstRoom = firstStore.createRoom({ cameraDeviceId: "camera-device-1" });
    const verified = firstStore.verifyPin(firstRoom.roomId, firstRoom.pin, {
      viewerDeviceId: "viewer-device-1"
    });
    const cameraPairToken = firstRoom.cameraPairing.cameraPairToken;
    assert.ok(cameraPairToken);

    const secondStore = createStore(() => 2000, { pairStoreFile });
    const secondRoom = secondStore.createRoom({
      pairId: firstRoom.cameraPairing.pairId,
      cameraDeviceId: firstRoom.cameraPairing.cameraDeviceId,
      cameraPairToken
    });
    assert.equal(secondRoom.cameraPairing.pairId, firstRoom.cameraPairing.pairId);
    assert.equal(secondStore.admitCamera(secondRoom.roomId, secondRoom.cameraToken), "accepted");

    const reconnected = secondStore.reconnectPair({
      pairId: verified.pairedCamera.pairId,
      viewerDeviceId: verified.pairedCamera.viewerDeviceId,
      viewerPairToken: verified.pairedCamera.viewerPairToken
    });
    assert.equal(reconnected.roomId, secondRoom.roomId);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("renames an existing paired camera when the camera rejoins", () => {
  const store = createStore();
  const firstRoom = store.createRoom({
    cameraDeviceId: "camera-device-1",
    displayName: "Old name"
  });
  const cameraPairToken = firstRoom.cameraPairing.cameraPairToken;
  assert.ok(cameraPairToken);

  const secondRoom = store.createRoom({
    pairId: firstRoom.cameraPairing.pairId,
    cameraDeviceId: firstRoom.cameraPairing.cameraDeviceId,
    cameraPairToken,
    displayName: "Kitchen phone"
  });
  const verified = store.verifyPin(secondRoom.roomId, secondRoom.pin, {
    viewerDeviceId: "viewer-device-1"
  });

  assert.equal(secondRoom.cameraPairing.displayName, "Kitchen phone");
  assert.equal(verified.pairedCamera.displayName, "Kitchen phone");
});

test("verifies a correct PIN and consumes a viewer token once", () => {
  const store = createStore();
  const room = store.createRoom();

  const result = store.verifyPin(room.roomId, room.pin, {
    viewerDeviceId: "viewer-device-1"
  });

  assert.equal(result.roomId, room.roomId);
  assert.ok(result.viewerToken.length > 20);
  assert.deepEqual(result.iceServers, iceServers);
  assert.equal(result.pairedCamera.pairId, room.cameraPairing.pairId);
  assert.equal(result.pairedCamera.viewerDeviceId, "viewer-device-1");
  assert.ok(result.pairedCamera.viewerPairToken);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), true);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), false);
  store.releaseViewer(room.roomId);
  assert.equal(store.consumeViewerToken(room.roomId, result.viewerToken), false);
});

test("reconnects a paired viewer without requiring the PIN again", () => {
  const store = createStore();
  const room = store.createRoom({ cameraDeviceId: "camera-device-1" });
  const verified = store.verifyPin(room.roomId, room.pin, {
    viewerDeviceId: "viewer-device-1"
  });
  assert.equal(store.admitCamera(room.roomId, room.cameraToken), "accepted");

  const reconnected = store.reconnectPair({
    pairId: verified.pairedCamera.pairId,
    viewerDeviceId: verified.pairedCamera.viewerDeviceId,
    viewerPairToken: verified.pairedCamera.viewerPairToken
  });

  assert.equal(reconnected.roomId, room.roomId);
  assert.ok(reconnected.viewerToken.length > 20);
  assert.notEqual(reconnected.viewerToken, verified.viewerToken);
  assert.deepEqual(reconnected.iceServers, iceServers);
  assert.equal(store.consumeViewerToken(room.roomId, reconnected.viewerToken), true);
});

test("rejects reconnect when the paired camera is offline", () => {
  const store = createStore();
  const room = store.createRoom({ cameraDeviceId: "camera-device-1" });
  const verified = store.verifyPin(room.roomId, room.pin, {
    viewerDeviceId: "viewer-device-1"
  });

  assert.throws(
    () =>
      store.reconnectPair({
        pairId: verified.pairedCamera.pairId,
        viewerDeviceId: verified.pairedCamera.viewerDeviceId,
        viewerPairToken: verified.pairedCamera.viewerPairToken
      }),
    /PAIR_CAMERA_OFFLINE/
  );
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

test("expires pending viewer admission when no socket consumes the token", () => {
  let now = 1000;
  const store = createStore(() => now, { viewerTokenTtlMs: 50 });
  const room = store.createRoom();

  const first = store.verifyPin(room.roomId, room.pin);
  assert.throws(
    () => store.verifyPin(room.roomId, room.pin),
    /VIEWER_ALREADY_RESERVED/
  );

  now = 1051;

  const second = store.verifyPin(room.roomId, room.pin);
  assert.notEqual(second.viewerToken, first.viewerToken);
  assert.equal(store.consumeViewerToken(room.roomId, first.viewerToken), false);
  assert.equal(store.consumeViewerToken(room.roomId, second.viewerToken), true);
  assert.throws(
    () => store.verifyPin(room.roomId, room.pin),
    /VIEWER_ALREADY_CONNECTED/
  );
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
