import assert from "node:assert/strict";
import test from "node:test";
import { createRoom, reconnectPair, getPairStatus, verifyPin } from "../src/api.js";
import type { ClientConfig } from "../src/config.js";

const config: ClientConfig = {
  httpUrl: "https://signal.example",
  wsUrl: "wss://signal.example/ws",
  preferredConnectionMode: "auto"
};

test("createRoom posts to the room endpoint and returns the server payload", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const responseBody = {
    roomId: "room-1",
    pin: "123456",
    cameraToken: "camera-token",
    expiresAt: 1234,
    qrPayload: "https://signal.example/?room=room-1",
    iceServers: [{ urls: "stun:example.test" }],
    cameraPairing: {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      displayName: "Camera",
      cameraPairToken: "camera-pair-token"
    }
  };
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responseBody), { status: 201 });
  };

  const room = await createRoom(config, fetcher, {
    cameraDeviceId: "camera-device-1",
    displayName: "Camera"
  });

  assert.deepEqual(room, responseBody);
  assert.equal(calls[0]?.url, "https://signal.example/rooms");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, JSON.stringify({
    cameraDeviceId: "camera-device-1",
    displayName: "Camera"
  }));
});

test("verifyPin sends the room and PIN before returning the viewer token", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const responseBody = {
    roomId: "room-1",
    viewerToken: "viewer-token",
    iceServers: [{ urls: "turn:relay.example" }],
    pairedCamera: {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Camera",
      lastConnectedAt: 1000
    }
  };
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responseBody), { status: 200 });
  };

  const verified = await verifyPin(config, "room-1", "123456", fetcher, {
    viewerDeviceId: "viewer-device-1"
  });
  const headers = calls[0]?.init?.headers as Record<string, string> | undefined;

  assert.deepEqual(verified, responseBody);
  assert.equal(calls[0]?.url, "https://signal.example/rooms/verify-pin");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(headers?.["content-type"], "application/json");
  assert.equal(calls[0]?.init?.body, JSON.stringify({
    roomId: "room-1",
    pin: "123456",
    viewerDeviceId: "viewer-device-1"
  }));
});

test("reconnectPair posts the saved paired camera credentials", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const responseBody = {
    roomId: "room-1",
    viewerToken: "viewer-token-2",
    iceServers: [{ urls: "turn:relay.example" }],
    pairedCamera: {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Camera",
      lastConnectedAt: 2000
    }
  };
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responseBody), { status: 200 });
  };

  const result = await reconnectPair(
    config,
    {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Camera",
      lastConnectedAt: 1000
    },
    fetcher
  );

  assert.deepEqual(result, responseBody);
  assert.equal(calls[0]?.url, "https://signal.example/pairs/reconnect");
  assert.equal(calls[0]?.init?.body, JSON.stringify({
    pairId: "pair-1",
    viewerDeviceId: "viewer-device-1",
    viewerPairToken: "viewer-pair-token"
  }));
});

test("getPairStatus posts the saved paired camera credentials", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(init?.body, JSON.stringify({
      pairId: "pair-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token"
    }));
    return new Response(
      JSON.stringify({
        pairId: "pair-1",
        displayName: "Camera",
        status: "live",
        lastSeenAt: 2000
      }),
      { status: 200 }
    );
  };

  const status = await getPairStatus(
    config,
    {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Camera",
      lastConnectedAt: 1000
    },
    fetcher
  );

  assert.equal(status.status, "live");
});

test("verifyPin surfaces server rejection codes", async () => {
  await assert.rejects(
    verifyPin(config, "room-1", "000000", async () => {
      return new Response(JSON.stringify({ code: "PIN_INVALID" }), { status: 400 });
    }),
    /PIN_INVALID/
  );
});
