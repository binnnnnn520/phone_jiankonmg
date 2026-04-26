import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage } from "@phone-monitor/shared";
import type {
  StoppableMediaStream,
  WakeLockSentinelLike
} from "../src/safety.js";

type CameraModule = typeof import("../src/camera.js") & {
  buildCameraJoinMessage?: (room: {
    roomId: string;
    cameraToken: string;
  }) => SignalingMessage;
  buildViewerUrl?: (
    roomId: string,
    options: { origin: string; publicViewerUrl?: string }
  ) => string;
  stopCameraSession?: (params: {
    peerController: { close: () => void };
    signaling?: {
      send: (message: SignalingMessage) => void;
      close: () => void;
    };
    stream?: StoppableMediaStream;
    wakeLock?: WakeLockSentinelLike;
    roomId: string;
  }) => Promise<void>;
};

async function cameraModule(): Promise<CameraModule> {
  return (await import("../src/camera.js")) as CameraModule;
}

test("buildViewerUrl creates a same-origin viewer URL with the room query", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildViewerUrl, "function");

  assert.equal(
    camera.buildViewerUrl!("room 1&2", { origin: "https://viewer.example" }),
    "https://viewer.example/?room=room+1%262"
  );
});

test("buildViewerUrl uses a configured public viewer base when provided", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildViewerUrl, "function");

  assert.equal(
    camera.buildViewerUrl!("room/1", {
      origin: "https://camera.example",
      publicViewerUrl: "https://public.example/monitor?source=qr"
    }),
    "https://public.example/monitor?source=qr&room=room%2F1"
  );
});

test("buildCameraJoinMessage includes the room's private camera token", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraJoinMessage, "function");

  assert.deepEqual(
    camera.buildCameraJoinMessage!({
      roomId: "room-1",
      cameraToken: "camera-token"
    }),
    {
      type: "join-camera",
      roomId: "room-1",
      cameraToken: "camera-token"
    }
  );
});

test("stopCameraSession releases wake lock after ending the room", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.stopCameraSession, "function");

  const events: string[] = [];
  await camera.stopCameraSession!({
    roomId: "room-1",
    peerController: {
      close: () => events.push("close-peer")
    },
    signaling: {
      send: (message) => events.push(`send:${message.type}`),
      close: () => events.push("close-signaling")
    },
    stream: {
      getTracks: () => [{ stop: () => events.push("stop-track") }]
    },
    wakeLock: {
      release: async () => {
        events.push("release-wake-lock");
      }
    }
  });

  assert.deepEqual(events, [
    "close-peer",
    "send:session-ended",
    "close-signaling",
    "stop-track",
    "release-wake-lock"
  ]);
});
