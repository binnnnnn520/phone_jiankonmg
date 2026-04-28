import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage, UserFacingConnectionState } from "@phone-monitor/shared";
import {
  extractRoomFromQrPayload,
  renderViewer,
  startViewerSession,
  startViewerSessionWithToken
} from "../src/viewer.js";
import type { ClientConfig } from "../src/config.js";
import type { SignalingClientLike } from "../src/signaling-client.js";
import type { PeerController } from "../src/webrtc.js";

const config: ClientConfig = {
  httpUrl: "https://signal.example",
  wsUrl: "wss://signal.example/ws",
  preferredConnectionMode: "auto"
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
