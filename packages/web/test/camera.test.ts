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
    options: {
      origin: string;
      publicViewerUrl?: string;
      connectionMode?: "nearby" | "remote";
    }
  ) => string;
  buildCameraShellMarkup?: (connectionLabel: string) => string;
  handleCameraStartupFailure?: (params: {
    error: unknown;
    status: { textContent: string | null };
    stream?: StoppableMediaStream;
    signaling?: { close: () => void };
    wakeLock?: WakeLockSentinelLike;
    isSecureContext: boolean;
    stopButton?: {
      disabled: boolean;
      addEventListener: (
        type: string,
        listener: () => void,
        options?: { once?: boolean }
      ) => void;
    };
  }) => Promise<void>;
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

test("buildCameraShellMarkup shows the approved same Wi-Fi mode copy", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraShellMarkup, "function");

  const markup = camera.buildCameraShellMarkup!("Same Wi-Fi");

  assert.match(markup, /Phone Monitor/);
  assert.match(markup, /PIN/);
  assert.match(markup, /Same Wi-Fi/);
  assert.doesNotMatch(markup.toLowerCase(), /server|signaling|turn|nat|deploy/);
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

test("buildViewerUrl carries the selected connection mode into QR links", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildViewerUrl, "function");

  assert.equal(
    camera.buildViewerUrl!("room-1", {
      origin: "https://app.example",
      connectionMode: "nearby"
    }),
    "https://app.example/?room=room-1&connection=nearby"
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

test("handleCameraStartupFailure keeps camera preview alive after remote pairing fails", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.handleCameraStartupFailure, "function");

  const events: string[] = [];
  let stopListener: (() => void) | undefined;
  const status = { textContent: "" };
  const stream: StoppableMediaStream = {
    getTracks: () => [{ stop: () => events.push("stop-track") }]
  };

  await camera.handleCameraStartupFailure!({
    error: new Error("Could not create monitoring room"),
    status,
    stream,
    signaling: { close: () => events.push("close-signaling") },
    wakeLock: {
      release: async () => {
        events.push("release-wake-lock");
      }
    },
    isSecureContext: true,
    stopButton: {
      disabled: true,
      addEventListener: (_type: string, listener: () => void) => {
        stopListener = listener;
      }
    }
  });

  assert.match(status.textContent ?? "", /remote connection/i);
  assert.deepEqual(events, ["close-signaling"]);

  stopListener?.();
  await Promise.resolve();
  assert.deepEqual(events, [
    "close-signaling",
    "stop-track",
    "release-wake-lock"
  ]);
});
