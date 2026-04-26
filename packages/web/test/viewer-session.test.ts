import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage, UserFacingConnectionState } from "@phone-monitor/shared";
import { startViewerSession } from "../src/viewer.js";
import type { ClientConfig } from "../src/config.js";
import type { SignalingClientLike } from "../src/signaling-client.js";
import type { PeerController } from "../src/webrtc.js";

const config: ClientConfig = {
  httpUrl: "https://signal.example",
  wsUrl: "wss://signal.example/ws"
};

function createSignaling(events: string[]): SignalingClientLike {
  return {
    async connect() {
      events.push("connect");
    },
    close() {
      events.push("close-signaling");
    },
    onMessage() {
      events.push("listen");
      return () => undefined;
    },
    send(message: SignalingMessage) {
      events.push(`send:${message.type}`);
    }
  };
}

function createPeer(events: string[]): PeerController {
  events.push("create-peer");
  return {
    peer: {
      close() {
        events.push("close-peer");
      }
    } as RTCPeerConnection,
    close() {
      events.push("close-peer");
    }
  };
}

test("startViewerSession verifies the PIN before signaling joins the room", async () => {
  const events: string[] = [];

  await startViewerSession({
    config,
    roomId: "room-1",
    pin: "123456",
    video: {} as HTMLVideoElement,
    onState: (state: UserFacingConnectionState) => events.push(`state:${state}`),
    deps: {
      verifyPin: async () => {
        events.push("verify-pin");
        return {
          roomId: "room-1",
          viewerToken: "viewer-token",
          iceServers: [{ urls: "stun:example.test" }]
        };
      },
      createSignalingClient: () => createSignaling(events),
      createPeer: () => createPeer(events)
    }
  });

  assert.deepEqual(events, [
    "state:Checking PIN",
    "verify-pin",
    "connect",
    "create-peer",
    "listen",
    "send:join-viewer",
    "state:Connecting"
  ]);
});

test("startViewerSession does not open signaling when PIN verification fails", async () => {
  const events: string[] = [];

  await assert.rejects(
    startViewerSession({
      config,
      roomId: "room-1",
      pin: "000000",
      video: {} as HTMLVideoElement,
      onState: (state: UserFacingConnectionState) => events.push(`state:${state}`),
      deps: {
        verifyPin: async () => {
          events.push("verify-pin");
          throw new Error("PIN_INVALID");
        },
        createSignalingClient: () => createSignaling(events),
        createPeer: () => createPeer(events)
      }
    }),
    /PIN_INVALID/
  );

  assert.deepEqual(events, ["state:Checking PIN", "verify-pin"]);
});
