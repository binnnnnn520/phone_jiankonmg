import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage } from "@phone-monitor/shared";
import type {
  StoppableMediaStream,
  WakeLockSentinelLike
} from "../src/safety.js";
import {
  VIDEO_QUALITY_STORAGE_KEY,
  buildVideoConstraints
} from "../src/video-quality.js";

type CameraModule = typeof import("../src/camera.js") & {
  buildCameraJoinMessage?: (room: {
    roomId: string;
    cameraToken: string;
  }) => SignalingMessage;
  buildCreateRoomRequest?: (
    deviceId: string,
    pairing?: {
      pairId: string;
      cameraDeviceId: string;
      displayName: string;
      cameraPairToken: string;
    },
    displayName?: string
  ) => {
    cameraDeviceId: string;
    displayName: string;
    pairId?: string;
    cameraPairToken?: string;
  };
  buildViewerUrl?: (
    roomId: string,
    options: {
      origin: string;
      publicViewerUrl?: string;
      connectionMode?: "nearby" | "remote";
    }
  ) => string;
  buildCameraShellMarkup?: (connectionLabel: string) => string;
  buildCameraAudioStatusText?: (audioEnabled: boolean) => string;
  buildCameraMediaConstraints?: (storage: {
    getItem: (key: string) => string | null;
  }) => MediaStreamConstraints;
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
  assert.match(markup, /class="pairing-command-center"/);
  assert.doesNotMatch(markup.toLowerCase(), /server|signaling|turn|nat|deploy/);
});

test("buildCameraShellMarkup includes compact battery status", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraShellMarkup, "function");

  const markup = camera.buildCameraShellMarkup!("Remote");

  assert.match(markup, /data-battery-status/);
  assert.match(markup, /Battery unavailable/);
});

test("buildCameraShellMarkup includes environment audio status", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraShellMarkup, "function");

  const markup = camera.buildCameraShellMarkup!("Remote");

  assert.match(markup, /id="audio-status"/);
  assert.match(markup, /Environment audio/);
});

test("buildCameraAudioStatusText describes live and unavailable audio", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraAudioStatusText, "function");

  assert.equal(
    camera.buildCameraAudioStatusText!(true),
    "Video and environment audio are live"
  );
  assert.equal(
    camera.buildCameraAudioStatusText!(false),
    "Environment audio is off"
  );
});

test("buildCameraShellMarkup includes compact keep-awake guidance", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraShellMarkup, "function");

  const markup = camera.buildCameraShellMarkup!("Remote");

  assert.match(markup, /id="wake-lock-guidance"/);
  assert.match(markup, /Keep this phone open/);
});

test("buildCreateRoomRequest reuses saved camera pairing credentials", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCreateRoomRequest, "function");

  assert.deepEqual(
    camera.buildCreateRoomRequest!("device-1", {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      displayName: "Front door",
      cameraPairToken: "camera-pair-token"
    }),
    {
      cameraDeviceId: "camera-device-1",
      displayName: "Front door",
      pairId: "pair-1",
      cameraPairToken: "camera-pair-token"
    }
  );
});

test("buildCreateRoomRequest uses the editable camera name", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCreateRoomRequest, "function");

  assert.deepEqual(
    camera.buildCreateRoomRequest!("device-1", undefined, "Kitchen phone"),
    {
      cameraDeviceId: "device-1",
      displayName: "Kitchen phone"
    }
  );

  assert.deepEqual(
    camera.buildCreateRoomRequest!(
      "device-1",
      {
        pairId: "pair-1",
        cameraDeviceId: "camera-device-1",
        displayName: "Old name",
        cameraPairToken: "camera-pair-token"
      },
      "Front door"
    ),
    {
      cameraDeviceId: "camera-device-1",
      displayName: "Front door",
      pairId: "pair-1",
      cameraPairToken: "camera-pair-token"
    }
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

test("buildCameraMediaConstraints requests environment audio by default", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.buildCameraMediaConstraints, "function");

  assert.deepEqual(
    camera.buildCameraMediaConstraints!({
      getItem: (key) =>
        key === VIDEO_QUALITY_STORAGE_KEY ? "data-saver" : null
    }),
    {
      video: buildVideoConstraints("data-saver"),
      audio: true
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
