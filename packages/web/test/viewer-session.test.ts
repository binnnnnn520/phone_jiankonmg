import assert from "node:assert/strict";
import test from "node:test";
import type {
  IceServerConfig,
  PairReconnectResponse,
  SignalingMessage,
  UserFacingConnectionState,
  ViewerPairedCamera
} from "@phone-monitor/shared";
import {
  buildViewerAudioStatusText,
  extractRoomFromQrPayload,
  hasAudioTrack,
  renderViewer,
  startViewerSession,
  startViewerSessionWithToken,
  toggleViewerAudio
} from "../src/viewer.js";
import type { ClientConfig } from "../src/config.js";
import type { SignalingClientLike } from "../src/signaling-client.js";
import type { PeerController } from "../src/webrtc.js";

const config: ClientConfig = {
  httpUrl: "https://signal.example",
  wsUrl: "wss://signal.example/ws",
  preferredConnectionMode: "auto"
};

type TestViewerSession = {
  disconnect: () => void;
};

type TestStartViewerSessionWithTokenParams = {
  config: ClientConfig;
  roomId: string;
  viewerToken: string;
  iceServers: IceServerConfig[];
  video: HTMLVideoElement;
  onState: (state: UserFacingConnectionState) => void;
  audioStatus?: Pick<HTMLElement, "textContent">;
  toggleAudio?: Pick<HTMLButtonElement, "textContent">;
};

type ViewerAutoReconnectController = {
  setPairedCamera: (camera: ViewerPairedCamera) => void;
  connectNow: () => Promise<void>;
  disconnect: () => void;
};

type CreateViewerAutoReconnectController = (params: {
  config: ClientConfig;
  video: HTMLVideoElement;
  status: Pick<HTMLElement, "textContent">;
  getSession: () => TestViewerSession | undefined;
  setSession: (session: TestViewerSession | undefined) => void;
  reconnectPair: (
    config: ClientConfig,
    pairedCamera: ViewerPairedCamera
  ) => Promise<PairReconnectResponse>;
  startViewerSessionWithToken: (
    params: TestStartViewerSessionWithTokenParams
  ) => Promise<TestViewerSession>;
  upsertPairedCamera: (camera: ViewerPairedCamera) => void;
  reconnectDelayMs?: number;
  scheduleReconnect?: (
    callback: () => void | Promise<void>,
    delayMs: number
  ) => unknown;
  cancelReconnect?: (handle: unknown) => void;
}) => ViewerAutoReconnectController;

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

function createInteractiveSignaling(events: string[]): SignalingClientLike & {
  emit: (message: SignalingMessage) => void;
} {
  let handler: ((message: SignalingMessage) => void) | undefined;
  return {
    async connect() {
      events.push("connect");
    },
    close() {
      events.push("close-signaling");
    },
    onMessage(nextHandler) {
      events.push("listen");
      handler = nextHandler;
      return () => {
        handler = undefined;
      };
    },
    send(message: SignalingMessage) {
      events.push(`send:${message.type}`);
    },
    emit(message: SignalingMessage) {
      handler?.(message);
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

function pairedCamera() {
  return {
    pairId: "pair-1",
    cameraDeviceId: "camera-device-1",
    viewerDeviceId: "viewer-device-1",
    viewerPairToken: "viewer-pair-token",
    displayName: "Paired camera",
    lastConnectedAt: 1000
  };
}

function reconnectResponse(roomId: string): PairReconnectResponse {
  return {
    roomId,
    viewerToken: `viewer-token-${roomId}`,
    iceServers: [{ urls: "stun:example.test" }],
    pairedCamera: {
      ...pairedCamera(),
      lastConnectedAt: Number(roomId.replace(/\D/g, "")) || 1
    }
  };
}

function offlinePairError(): Error {
  return new Error("PAIR_CAMERA_OFFLINE");
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadReconnectController(): Promise<CreateViewerAutoReconnectController> {
  const viewerModule = (await import("../src/viewer.js")) as {
    createViewerAutoReconnectController?: unknown;
  };
  assert.equal(
    typeof viewerModule.createViewerAutoReconnectController,
    "function"
  );
  return viewerModule.createViewerAutoReconnectController as CreateViewerAutoReconnectController;
}

class TestDocument {
  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this);
  }
}

class TestElement {
  readonly children: TestElement[] = [];
  readonly ownerDocument: TestDocument;
  readonly tagName: string;
  className = "";
  id = "";
  textContent: string | null = "";
  value = "";
  autocomplete = "";
  inputMode = "";
  maxLength = 0;
  type = "";
  disabled = false;
  muted = false;
  srcObject: unknown;

  constructor(tagName: string, ownerDocument: TestDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }

  set innerHTML(markup: string) {
    this.children.length = 0;
    const tagPattern = /<([a-z0-9-]+)\b([^>]*)>/gi;
    for (const match of markup.matchAll(tagPattern)) {
      const child = this.ownerDocument.createElement(match[1] ?? "div");
      const attributes = match[2] ?? "";
      child.id = /\bid="([^"]*)"/i.exec(attributes)?.[1] ?? "";
      child.value = /\bvalue="([^"]*)"/i.exec(attributes)?.[1] ?? "";
      if (child.id) this.children.push(child);
    }
  }

  get innerHTML(): string {
    return "";
  }

  append(...items: Array<TestElement | string>): void {
    for (const item of items) {
      if (typeof item !== "string") this.children.push(item);
    }
  }

  appendChild(child: TestElement): TestElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...items: TestElement[]): void {
    this.children.length = 0;
    this.children.push(...items);
  }

  addEventListener(): void {
    // Tests only assert render-time DOM state.
  }

  setAttribute(name: string, value: string): void {
    if (name === "id") this.id = value;
  }

  querySelector(selector: string): TestElement | null {
    if (!selector.startsWith("#")) return null;
    return this.findById(selector.slice(1));
  }

  private findById(id: string): TestElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const match = child.findById(id);
      if (match) return match;
    }
    return null;
  }
}

function withWindowSearch<T>(search: string, callback: () => T): T {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search } }
  });

  try {
    return callback();
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    }
  }
}

test("hasAudioTrack detects remote environment audio tracks", () => {
  const withAudio = {
    getAudioTracks: () => [{ enabled: true }]
  } as unknown as MediaStream;
  const withoutAudio = {
    getAudioTracks: () => []
  } as unknown as MediaStream;

  assert.equal(hasAudioTrack(withAudio), true);
  assert.equal(hasAudioTrack(withoutAudio), false);
});

test("buildViewerAudioStatusText describes live and unavailable remote audio", () => {
  assert.equal(
    buildViewerAudioStatusText(true),
    "Environment audio is live"
  );
  assert.equal(
    buildViewerAudioStatusText(false),
    "Environment audio unavailable"
  );
});

test("toggleViewerAudio flips the local viewer mute state", () => {
  const video = { muted: true } as HTMLVideoElement;
  const button = { textContent: "" };

  toggleViewerAudio(video, button);
  assert.equal(video.muted, false);
  assert.equal(button.textContent, "Mute audio");

  toggleViewerAudio(video, button);
  assert.equal(video.muted, true);
  assert.equal(button.textContent, "Unmute audio");
});

test("startViewerSession verifies the PIN before signaling joins the room", async () => {
  const events: string[] = [];
  const paired: unknown[] = [];

  await startViewerSession({
    config,
    roomId: "room-1",
    pin: "123456",
    viewerDeviceId: "viewer-device-1",
    video: {} as HTMLVideoElement,
    onPairedCamera: (camera) => paired.push(camera),
    onState: (state: UserFacingConnectionState) => events.push(`state:${state}`),
    deps: {
      verifyPin: async (_config, _roomId, _pin, _fetcher, pairing) => {
        events.push("verify-pin");
        events.push(`viewer:${pairing?.viewerDeviceId}`);
        return {
          roomId: "room-1",
          viewerToken: "viewer-token",
          iceServers: [{ urls: "stun:example.test" }],
          pairedCamera: pairedCamera()
        };
      },
      createSignalingClient: () => createSignaling(events),
      createPeer: () => createPeer(events)
    }
  });

  assert.deepEqual(events, [
    "state:Checking PIN",
    "verify-pin",
    "viewer:viewer-device-1",
    "connect",
    "create-peer",
    "listen",
    "send:join-viewer",
    "state:Connecting"
  ]);
  assert.deepEqual(paired, [pairedCamera()]);
});

test("startViewerSessionWithToken joins signaling without verifying the PIN", async () => {
  const events: string[] = [];

  await startViewerSessionWithToken({
    config,
    roomId: "room-1",
    viewerToken: "viewer-token",
    iceServers: [{ urls: "stun:example.test" }],
    video: {} as HTMLVideoElement,
    onState: (state: UserFacingConnectionState) => events.push(`state:${state}`),
    deps: {
      createSignalingClient: () => createSignaling(events),
      createPeer: () => createPeer(events)
    }
  });

  assert.deepEqual(events, [
    "connect",
    "create-peer",
    "listen",
    "send:join-viewer",
    "state:Connecting"
  ]);
});

test("viewer auto reconnect waits offline and restarts token sessions", async () => {
  const createController = await loadReconnectController();
  const status = { textContent: "" };
  const video = {} as HTMLVideoElement;
  const scheduled: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
  }> = [];
  const savedPairs: ViewerPairedCamera[] = [];
  const stateHandlers: Array<(state: UserFacingConnectionState) => void> = [];
  const responses: Array<() => Promise<PairReconnectResponse>> = [
    async () => reconnectResponse("room-1"),
    async () => {
      throw offlinePairError();
    },
    async () => reconnectResponse("room-2")
  ];
  const reconnectAttempts: string[] = [];
  const startedRooms: string[] = [];
  let session: TestViewerSession | undefined;

  const controller = createController({
    config,
    video,
    status,
    getSession: () => session,
    setSession: (nextSession) => {
      session = nextSession;
    },
    reconnectPair: async (_config, camera) => {
      reconnectAttempts.push(camera.pairId);
      const nextResponse = responses.shift();
      assert.ok(nextResponse);
      return nextResponse();
    },
    startViewerSessionWithToken: async (params) => {
      startedRooms.push(params.roomId);
      stateHandlers.push(params.onState);
      params.onState("Connecting");
      return {
        disconnect: () => {
          params.onState("Session ended");
        }
      };
    },
    upsertPairedCamera: (camera) => {
      savedPairs.push(camera);
    },
    reconnectDelayMs: 25,
    scheduleReconnect: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return callback;
    }
  });

  controller.setPairedCamera(pairedCamera());
  await controller.connectNow();

  assert.equal(status.textContent, "Connecting");
  assert.deepEqual(startedRooms, ["room-1"]);

  stateHandlers[0]?.("Camera offline");

  assert.equal(status.textContent, "Camera offline. Waiting to reconnect...");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.delayMs, 25);

  await scheduled.shift()?.callback();
  await settlePromises();

  assert.equal(status.textContent, "Camera offline. Waiting to reconnect...");
  assert.equal(scheduled.length, 1);
  assert.deepEqual(startedRooms, ["room-1"]);

  await scheduled.shift()?.callback();
  await settlePromises();

  assert.equal(status.textContent, "Connecting");
  assert.deepEqual(startedRooms, ["room-1", "room-2"]);
  assert.deepEqual(reconnectAttempts, ["pair-1", "pair-1", "pair-1"]);
  assert.deepEqual(savedPairs.map((camera) => camera.lastConnectedAt), [1, 2]);
  assert.equal(scheduled.length, 0);
});

test("viewer auto reconnect avoids concurrent attempts and stops on disconnect", async () => {
  const createController = await loadReconnectController();
  const status = { textContent: "" };
  const video = {} as HTMLVideoElement;
  const scheduled: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
  }> = [];
  const stateHandlers: Array<(state: UserFacingConnectionState) => void> = [];
  const pendingReconnect = deferred<PairReconnectResponse>();
  const responses: Array<() => Promise<PairReconnectResponse>> = [
    async () => reconnectResponse("room-1"),
    () => pendingReconnect.promise
  ];
  let reconnectAttemptCount = 0;
  let startSessionCount = 0;
  let session: TestViewerSession | undefined;

  const controller = createController({
    config,
    video,
    status,
    getSession: () => session,
    setSession: (nextSession) => {
      session = nextSession;
    },
    reconnectPair: async () => {
      reconnectAttemptCount += 1;
      const nextResponse = responses.shift();
      assert.ok(nextResponse);
      return nextResponse();
    },
    startViewerSessionWithToken: async (params) => {
      startSessionCount += 1;
      stateHandlers.push(params.onState);
      params.onState("Connecting");
      return {
        disconnect: () => {
          params.onState("Session ended");
        }
      };
    },
    upsertPairedCamera: () => undefined,
    reconnectDelayMs: 25,
    scheduleReconnect: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return callback;
    },
    cancelReconnect: () => undefined
  });

  controller.setPairedCamera(pairedCamera());
  await controller.connectNow();
  stateHandlers[0]?.("Session ended");

  const retry = scheduled.shift();
  assert.ok(retry);
  const firstRetry = retry.callback();
  await retry.callback();

  assert.equal(reconnectAttemptCount, 2);
  assert.equal(startSessionCount, 1);

  controller.disconnect();
  pendingReconnect.resolve(reconnectResponse("room-2"));
  await firstRetry;
  await settlePromises();

  assert.equal(reconnectAttemptCount, 2);
  assert.equal(startSessionCount, 1);
  assert.equal(status.textContent, "Session ended");
});

test("viewer auto reconnect closes stale sessions before retrying retry-needed state", async () => {
  const createController = await loadReconnectController();
  const status = { textContent: "" };
  const video = {} as HTMLVideoElement;
  const scheduled: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
  }> = [];
  const stateHandlers: Array<(state: UserFacingConnectionState) => void> = [];
  const responses: Array<() => Promise<PairReconnectResponse>> = [
    async () => reconnectResponse("room-1"),
    async () => reconnectResponse("room-2")
  ];
  const startedRooms: string[] = [];
  let reconnectAttemptCount = 0;
  let disconnectCount = 0;
  let session: TestViewerSession | undefined;

  const controller = createController({
    config,
    video,
    status,
    getSession: () => session,
    setSession: (nextSession) => {
      session = nextSession;
    },
    reconnectPair: async () => {
      reconnectAttemptCount += 1;
      if (reconnectAttemptCount === 2) {
        assert.equal(session, undefined);
      }
      const nextResponse = responses.shift();
      assert.ok(nextResponse);
      return nextResponse();
    },
    startViewerSessionWithToken: async (params) => {
      startedRooms.push(params.roomId);
      stateHandlers.push(params.onState);
      params.onState("Connecting");
      return {
        disconnect: () => {
          disconnectCount += 1;
          params.onState("Session ended");
        }
      };
    },
    upsertPairedCamera: () => undefined,
    reconnectDelayMs: 25,
    scheduleReconnect: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return callback;
    },
    cancelReconnect: () => undefined
  });

  controller.setPairedCamera(pairedCamera());
  await controller.connectNow();
  stateHandlers[0]?.("Retry needed");
  await scheduled.shift()?.callback();
  await settlePromises();

  assert.equal(disconnectCount, 1);
  assert.deepEqual(startedRooms, ["room-1", "room-2"]);
  assert.equal(status.textContent, "Connecting");
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

test("renderViewer keeps malicious room query text literal without injected DOM", () => {
  const app = new TestDocument().createElement("div");
  const maliciousRoom = `room-1" autofocus /><img id="injected" src=x onerror="alert(1)">`;

  withWindowSearch(`?room=${encodeURIComponent(maliciousRoom)}`, () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.equal(app.querySelector("#injected"), null);
  assert.equal(app.querySelector("#room")?.value, maliciousRoom);
});

test("renderViewer shows the remote connection mode label by default", () => {
  const app = new TestDocument().createElement("div");

  withWindowSearch("?mode=viewer", () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.match(app.children[0]?.className ?? "", /light-monitor-shell/);
  assert.equal(app.querySelector("#connection-mode")?.textContent, "Remote");
});

test("renderViewer honors a same Wi-Fi connection route override", () => {
  const app = new TestDocument().createElement("div");

  withWindowSearch("?mode=viewer&connection=nearby", () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.equal(app.querySelector("#connection-mode")?.textContent, "Same Wi-Fi");
});

test("renderViewer includes a QR scan action before manual PIN entry", () => {
  const app = new TestDocument().createElement("div");

  withWindowSearch("?mode=viewer", () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.equal(app.querySelector("#scan-qr")?.textContent, "Scan QR code");
});

test("renderViewer includes environment audio status and control", () => {
  const app = new TestDocument().createElement("div");

  withWindowSearch("?mode=viewer", () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.equal(
    app.querySelector("#audio-status")?.textContent,
    "Environment audio unavailable"
  );
  assert.equal(app.querySelector("#toggle-audio")?.textContent, "Unmute audio");
});

test("renderViewer includes compact battery status", () => {
  const app = new TestDocument().createElement("div");

  withWindowSearch("?mode=viewer", () => {
    renderViewer(app as unknown as HTMLElement);
  });

  assert.equal(app.querySelector("#battery-status")?.textContent, "Battery unavailable");
});

test("extractRoomFromQrPayload reads room IDs from viewer URLs", () => {
  assert.equal(
    extractRoomFromQrPayload("https://public.example/monitor?room=room-123"),
    "room-123"
  );
  assert.equal(extractRoomFromQrPayload("room-raw"), "room-raw");
});

test("startViewerSession shows ended state and clears video on explicit session-ended", async () => {
  const events: string[] = [];
  const states: UserFacingConnectionState[] = [];
  const signaling = createInteractiveSignaling(events);
  const stream = {} as MediaStream;
  const video = { srcObject: stream } as unknown as HTMLVideoElement;

  await startViewerSession({
    config,
    roomId: "room-1",
    pin: "123456",
    video,
    onState: (state) => states.push(state),
    deps: {
      verifyPin: async () => ({
        roomId: "room-1",
        viewerToken: "viewer-token",
        iceServers: [{ urls: "stun:example.test" }],
        pairedCamera: pairedCamera()
      }),
      createSignalingClient: () => signaling,
      createPeer: () => createPeer(events)
    }
  });

  signaling.emit({
    type: "session-ended",
    roomId: "room-1",
    reason: "Camera stopped monitoring"
  });

  assert.equal(states.at(-1), "Session ended");
  assert.equal(video.srcObject, null);
});

test("startViewerSession keeps peer-left as camera offline without clearing video", async () => {
  const events: string[] = [];
  const states: UserFacingConnectionState[] = [];
  const signaling = createInteractiveSignaling(events);
  const stream = {} as MediaStream;
  const video = { srcObject: stream } as unknown as HTMLVideoElement;

  await startViewerSession({
    config,
    roomId: "room-1",
    pin: "123456",
    video,
    onState: (state) => states.push(state),
    deps: {
      verifyPin: async () => ({
        roomId: "room-1",
        viewerToken: "viewer-token",
        iceServers: [{ urls: "stun:example.test" }],
        pairedCamera: pairedCamera()
      }),
      createSignalingClient: () => signaling,
      createPeer: () => createPeer(events)
    }
  });

  signaling.emit({ type: "peer-left", roomId: "room-1", role: "camera" });

  assert.equal(states.at(-1), "Camera offline");
  assert.equal(video.srcObject, stream);
});

test("startViewerSession marks remote video active only while connected", async () => {
  const events: string[] = [];
  const states: UserFacingConnectionState[] = [];
  const remoteStream = {} as MediaStream;
  const video = {
    dataset: {},
    srcObject: null
  } as unknown as HTMLVideoElement;

  const session = await startViewerSession({
    config,
    roomId: "room-1",
    pin: "123456",
    video,
    onState: (state) => states.push(state),
    deps: {
      verifyPin: async () => ({
        roomId: "room-1",
        viewerToken: "viewer-token",
        iceServers: [{ urls: "stun:example.test" }],
        pairedCamera: pairedCamera()
      }),
      createSignalingClient: () => createSignaling(events),
      createPeer: (params) => {
        params.onRemoteStream?.(remoteStream);
        return createPeer(events);
      }
    }
  });

  assert.equal(video.srcObject, remoteStream);
  assert.equal(video.dataset.streamState, "live");

  session.disconnect();

  assert.equal(video.srcObject, null);
  assert.equal(video.dataset.streamState, undefined);
  assert.equal(states.at(-1), "Session ended");
});

test("startViewerSessionWithToken updates viewer audio status from remote stream tracks", async () => {
  const events: string[] = [];
  const remoteStream = {
    getAudioTracks: () => [{ enabled: true }]
  } as unknown as MediaStream;
  const audioStatus = { textContent: "" };
  const toggleAudio = { textContent: "" };
  const video = {
    dataset: {},
    muted: true,
    srcObject: null
  } as unknown as HTMLVideoElement;

  await startViewerSessionWithToken({
    config,
    roomId: "room-1",
    viewerToken: "viewer-token",
    iceServers: [{ urls: "stun:example.test" }],
    video,
    onState: () => undefined,
    audioStatus,
    toggleAudio,
    deps: {
      createSignalingClient: () => createSignaling(events),
      createPeer: (params) => {
        params.onRemoteStream?.(remoteStream);
        return createPeer(events);
      }
    }
  });

  assert.equal(video.srcObject, remoteStream);
  assert.equal(video.muted, true);
  assert.equal(audioStatus.textContent, "Environment audio is live");
  assert.equal(toggleAudio.textContent, "Unmute audio");
});
