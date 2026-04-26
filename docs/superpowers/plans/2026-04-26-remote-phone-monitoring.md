# Remote Phone Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Version 1 PWA-based remote live monitoring loop where an old phone creates a camera room, a viewer scans QR plus enters PIN, and WebRTC connects remotely with TURN fallback support.

**Architecture:** Use a small TypeScript npm workspace with three packages: `@phone-monitor/shared` for protocol and state helpers, `@phone-monitor/server` for HTTP/WebSocket signaling, and `@phone-monitor/web` for the Camera PWA and Viewer PWA. The server never stores video; it only keeps short-lived room, PIN, signaling, and connection state.

**Tech Stack:** TypeScript, Node.js, Vite, vanilla browser APIs, WebRTC, WebSocket, `ws`, `qrcode`, Node test runner, Playwright for browser smoke tests.

---

## Scope Check

The spec contains several future subsystems: Android native capture, local recording, motion detection, alerts, accounts, and playback. This plan implements only Version 1 remote live viewing. Future recording and Android native work must get separate specs and plans.

## File Structure

- Create `package.json`: npm workspace scripts for install, build, test, lint-style type checks, server dev, and web dev.
- Create `tsconfig.base.json`: shared strict TypeScript settings.
- Create `.env.example`: documented runtime configuration for signaling URL and ICE servers.
- Create `packages/shared/src/types.ts`: shared room, signaling, and connection-state types.
- Create `packages/shared/src/pairing.ts`: room ID, PIN, hashing, retry, and expiry helpers.
- Create `packages/shared/src/state.ts`: client-facing connection-state mapping.
- Create `packages/shared/test/*.test.ts`: repeatable tests for pairing and state helpers.
- Create `packages/server/src/store.ts`: in-memory short-lived room store.
- Create `packages/server/src/http.ts`: static health/config endpoints.
- Create `packages/server/src/ws.ts`: WebSocket signaling protocol.
- Create `packages/server/src/index.ts`: server bootstrap.
- Create `packages/server/test/*.test.ts`: store and signaling-contract tests.
- Create `packages/web/index.html`: Vite entry shell.
- Create `packages/web/public/manifest.webmanifest`: installable PWA metadata.
- Create `packages/web/src/main.ts`: route between home, camera, and viewer screens.
- Create `packages/web/src/api.ts`: HTTP calls to create room and verify PIN.
- Create `packages/web/src/signaling-client.ts`: browser WebSocket client.
- Create `packages/web/src/webrtc.ts`: browser WebRTC adapter.
- Create `packages/web/src/camera.ts`: camera-side UI and media lifecycle.
- Create `packages/web/src/viewer.ts`: viewer-side UI and playback lifecycle.
- Create `packages/web/src/safety.ts`: permission, visibility, wake-lock, and stop-state helpers.
- Create `packages/web/src/styles.css`: restrained monitoring UI styles.
- Create `packages/web/test/*.test.ts`: state and UI helper tests.
- Create `e2e/remote-live.spec.ts`: browser smoke test for pairing flow using mocked media.
- Create `docs/testing/manual-remote-validation.md`: device validation checklist for home Wi-Fi, mobile data, and TURN fallback.

## Task 1: Workspace and Shared Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/state.ts`
- Create: `packages/shared/test/state.test.ts`

- [ ] **Step 1: Create the workspace package files**

Create `package.json`:

```json
{
  "name": "phone-monitoring-app",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/shared",
    "packages/server",
    "packages/web"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:server": "npm run dev --workspace @phone-monitor/server",
    "dev:web": "npm run dev --workspace @phone-monitor/web",
    "test": "npm run test --workspaces",
    "typecheck": "npm run typecheck --workspaces"
  },
  "devDependencies": {
    "@playwright/test": "^1.43.0",
    "typescript": "^5.4.0"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create `.env.example`:

```bash
SIGNALING_HOST=0.0.0.0
SIGNALING_PORT=8787
PUBLIC_SIGNALING_HTTP_URL=http://localhost:8787
PUBLIC_SIGNALING_WS_URL=ws://localhost:8787/ws
ROOM_TTL_SECONDS=600
PIN_MAX_ATTEMPTS=5
ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:localhost:3478","username":"local-dev","credential":"local-dev"}]
```

- [ ] **Step 2: Create the shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@phone-monitor/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test dist/test/*.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {}
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Write shared protocol types**

Create `packages/shared/src/types.ts`:

```ts
export type RoomId = string;
export type ClientRole = "camera" | "viewer";

export type RoomStatus =
  | "waiting-for-viewer"
  | "pin-required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "ended";

export type UserFacingConnectionState =
  | "Waiting for viewer"
  | "Checking PIN"
  | "Connecting"
  | "Live"
  | "Reconnecting"
  | "Using relay connection"
  | "Camera offline"
  | "Session ended"
  | "Retry needed";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CreateRoomResponse {
  roomId: RoomId;
  pin: string;
  expiresAt: number;
  qrPayload: string;
  iceServers: IceServerConfig[];
}

export interface VerifyPinRequest {
  roomId: RoomId;
  pin: string;
}

export interface VerifyPinResponse {
  roomId: RoomId;
  viewerToken: string;
  iceServers: IceServerConfig[];
}

export type SignalingMessage =
  | { type: "join-camera"; roomId: RoomId }
  | { type: "join-viewer"; roomId: RoomId; viewerToken: string }
  | { type: "offer"; roomId: RoomId; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; roomId: RoomId; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: RoomId; candidate: RTCIceCandidateInit }
  | { type: "peer-left"; roomId: RoomId; role: ClientRole }
  | { type: "session-ended"; roomId: RoomId; reason: string }
  | { type: "error"; code: string; message: string };
```

Create `packages/shared/src/state.ts`:

```ts
import type { UserFacingConnectionState } from "./types.js";

export function mapIceStateToUserState(
  iceState: RTCIceConnectionState,
  relayActive: boolean
): UserFacingConnectionState {
  if (relayActive && iceState === "connected") return "Using relay connection";
  if (iceState === "connected" || iceState === "completed") return "Live";
  if (iceState === "checking" || iceState === "new") return "Connecting";
  if (iceState === "disconnected") return "Reconnecting";
  if (iceState === "closed") return "Session ended";
  return "Retry needed";
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./types.js";
export * from "./state.js";
```

- [ ] **Step 4: Add a failing state test**

Create `packages/shared/test/state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapIceStateToUserState } from "../src/state.js";

test("maps a connected direct WebRTC state to Live", () => {
  assert.equal(mapIceStateToUserState("connected", false), "Live");
});

test("maps a connected relayed WebRTC state to Using relay connection", () => {
  assert.equal(
    mapIceStateToUserState("connected", true),
    "Using relay connection"
  );
});

test("maps disconnected to Reconnecting", () => {
  assert.equal(mapIceStateToUserState("disconnected", false), "Reconnecting");
});
```

- [ ] **Step 5: Install dependencies and run the shared test**

Run:

```bash
npm install
npm run build --workspace @phone-monitor/shared
npm run test --workspace @phone-monitor/shared
```

Expected: build succeeds and three state tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json tsconfig.base.json .env.example packages/shared
git commit -m "Establish typed workspace for remote monitoring" \
  -m "The implementation needs a shared contract before the server and browser clients can evolve independently. This commit adds the workspace skeleton, strict TypeScript defaults, and the first connection-state helper with tests." \
  -m "Constraint: Version 1 must keep WebRTC state understandable for ordinary users" \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test --workspace @phone-monitor/shared" \
  -m "Not-tested: Server and browser packages are not created yet"
```

## Task 2: Pairing and Room State

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `packages/shared/src/pairing.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/pairing.test.ts`

- [ ] **Step 1: Add room and PIN helpers**

Create `packages/shared/src/pairing.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { RoomId } from "./types.js";

export interface PinPolicy {
  length: 4 | 5 | 6;
  maxAttempts: number;
}

export interface PinCheckResult {
  ok: boolean;
  locked: boolean;
  attemptsRemaining: number;
}

export function createRoomId(): RoomId {
  return randomBytes(12).toString("base64url");
}

export function createPin(policy: PinPolicy): string {
  const upper = 10 ** policy.length;
  return String(Math.floor(Math.random() * upper)).padStart(policy.length, "0");
}

export function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function isExpired(now: number, expiresAt: number): boolean {
  return now >= expiresAt;
}

export function checkPinAttempt(params: {
  expectedHash: string;
  salt: string;
  submittedPin: string;
  failedAttempts: number;
  maxAttempts: number;
}): PinCheckResult {
  const lockedBeforeAttempt = params.failedAttempts >= params.maxAttempts;
  if (lockedBeforeAttempt) {
    return { ok: false, locked: true, attemptsRemaining: 0 };
  }

  const ok = hashPin(params.submittedPin, params.salt) === params.expectedHash;
  const failedAttempts = ok ? params.failedAttempts : params.failedAttempts + 1;
  const attemptsRemaining = Math.max(params.maxAttempts - failedAttempts, 0);

  return {
    ok,
    locked: !ok && attemptsRemaining === 0,
    attemptsRemaining
  };
}
```

Update `packages/shared/src/index.ts`:

```ts
export * from "./types.js";
export * from "./state.js";
export * from "./pairing.js";
```

- [ ] **Step 2: Test room and PIN behavior**

Create `packages/shared/test/pairing.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPinAttempt,
  createPin,
  createRoomId,
  hashPin,
  isExpired
} from "../src/pairing.js";

test("creates URL-safe room IDs", () => {
  const roomId = createRoomId();
  assert.match(roomId, /^[A-Za-z0-9_-]+$/);
  assert.ok(roomId.length >= 16);
});

test("creates fixed-length numeric PINs", () => {
  const pin = createPin({ length: 6, maxAttempts: 5 });
  assert.match(pin, /^[0-9]{6}$/);
});

test("accepts a correct PIN hash", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);
  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "123456",
      failedAttempts: 2,
      maxAttempts: 5
    }),
    { ok: true, locked: false, attemptsRemaining: 3 }
  );
});

test("locks after the final failed PIN attempt", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);
  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "000000",
      failedAttempts: 4,
      maxAttempts: 5
    }),
    { ok: false, locked: true, attemptsRemaining: 0 }
  );
});

test("expires rooms at the configured timestamp", () => {
  assert.equal(isExpired(1000, 999), true);
  assert.equal(isExpired(1000, 1001), false);
});
```

- [ ] **Step 3: Run shared tests**

Run:

```bash
npm run build --workspace @phone-monitor/shared
npm run test --workspace @phone-monitor/shared
```

Expected: all shared tests pass.

- [ ] **Step 4: Commit Task 2**

```bash
git add packages/shared
git commit -m "Define short-lived room pairing rules" \
  -m "Remote viewing needs QR plus PIN admission before any signaling messages are accepted. This commit adds room ID generation, PIN hashing, expiry checks, retry lockout behavior, and tests." \
  -m "Constraint: Rooms must be short-lived and PIN guessing must be bounded" \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test --workspace @phone-monitor/shared" \
  -m "Not-tested: Browser QR display is not created yet"
```

## Task 3: Signaling Server Room Store and HTTP API

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/config.ts`
- Create: `packages/server/src/store.ts`
- Create: `packages/server/src/http.ts`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/test/store.test.ts`

- [ ] **Step 1: Create server package files**

Create `packages/server/package.json`:

```json
{
  "name": "@phone-monitor/server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/src/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "node --watch dist/src/index.js",
    "test": "node --test dist/test/*.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@phone-monitor/shared": "0.1.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

Create `packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: Implement configuration parsing**

Create `packages/server/src/config.ts`:

```ts
import type { IceServerConfig } from "@phone-monitor/shared";

export interface ServerConfig {
  host: string;
  port: number;
  publicHttpUrl: string;
  roomTtlMs: number;
  pinMaxAttempts: number;
  iceServers: IceServerConfig[];
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const port = Number(env.SIGNALING_PORT ?? "8787");
  const roomTtlMs = Number(env.ROOM_TTL_SECONDS ?? "600") * 1000;
  const pinMaxAttempts = Number(env.PIN_MAX_ATTEMPTS ?? "5");
  const iceServers = JSON.parse(
    env.ICE_SERVERS_JSON ??
      '[{"urls":"stun:stun.l.google.com:19302"}]'
  ) as IceServerConfig[];

  return {
    host: env.SIGNALING_HOST ?? "0.0.0.0",
    port,
    publicHttpUrl: env.PUBLIC_SIGNALING_HTTP_URL ?? `http://localhost:${port}`,
    roomTtlMs,
    pinMaxAttempts,
    iceServers
  };
}
```

- [ ] **Step 3: Implement in-memory room store**

Create `packages/server/src/store.ts`:

```ts
import {
  checkPinAttempt,
  createPin,
  createRoomId,
  hashPin,
  isExpired,
  type CreateRoomResponse,
  type IceServerConfig,
  type RoomId,
  type VerifyPinResponse
} from "@phone-monitor/shared";
import { randomBytes } from "node:crypto";

interface RoomRecord {
  roomId: RoomId;
  pinHash: string;
  salt: string;
  pinFailedAttempts: number;
  expiresAt: number;
  viewerToken?: string;
  viewerConnected: boolean;
}

export class RoomStore {
  private readonly rooms = new Map<RoomId, RoomRecord>();

  constructor(
    private readonly params: {
      publicHttpUrl: string;
      roomTtlMs: number;
      pinMaxAttempts: number;
      iceServers: IceServerConfig[];
      now: () => number;
    }
  ) {}

  createRoom(): CreateRoomResponse {
    const roomId = createRoomId();
    const pin = createPin({ length: 6, maxAttempts: this.params.pinMaxAttempts });
    const salt = randomBytes(12).toString("base64url");
    const expiresAt = this.params.now() + this.params.roomTtlMs;

    this.rooms.set(roomId, {
      roomId,
      pinHash: hashPin(pin, salt),
      salt,
      pinFailedAttempts: 0,
      expiresAt,
      viewerConnected: false
    });

    return {
      roomId,
      pin,
      expiresAt,
      qrPayload: `${this.params.publicHttpUrl}/?room=${encodeURIComponent(roomId)}`,
      iceServers: this.params.iceServers
    };
  }

  verifyPin(roomId: RoomId, pin: string): VerifyPinResponse {
    const room = this.rooms.get(roomId);
    if (!room || isExpired(this.params.now(), room.expiresAt)) {
      this.rooms.delete(roomId);
      throw new Error("ROOM_EXPIRED");
    }
    if (room.viewerConnected) throw new Error("VIEWER_ALREADY_CONNECTED");

    const result = checkPinAttempt({
      expectedHash: room.pinHash,
      salt: room.salt,
      submittedPin: pin,
      failedAttempts: room.pinFailedAttempts,
      maxAttempts: this.params.pinMaxAttempts
    });

    if (!result.ok) {
      room.pinFailedAttempts += 1;
      throw new Error(result.locked ? "PIN_LOCKED" : "PIN_INVALID");
    }

    room.viewerToken = randomBytes(18).toString("base64url");
    return {
      roomId,
      viewerToken: room.viewerToken,
      iceServers: this.params.iceServers
    };
  }

  hasRoom(roomId: RoomId): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (isExpired(this.params.now(), room.expiresAt)) {
      this.rooms.delete(roomId);
      return false;
    }
    return true;
  }

  consumeViewerToken(roomId: RoomId, token: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.viewerToken !== token || room.viewerConnected) return false;
    room.viewerConnected = true;
    return true;
  }

  releaseViewer(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (room) room.viewerConnected = false;
  }
}
```

- [ ] **Step 4: Test room store behavior**

Create `packages/server/test/store.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { RoomStore } from "../src/store.js";

function createStore(now: () => number = () => 1000) {
  return new RoomStore({
    publicHttpUrl: "https://monitor.local",
    roomTtlMs: 60000,
    pinMaxAttempts: 2,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    now
  });
}

test("creates a room with QR payload, PIN, and ICE servers", () => {
  const room = createStore().createRoom();
  assert.match(room.pin, /^[0-9]{6}$/);
  assert.equal(room.qrPayload, `https://monitor.local/?room=${room.roomId}`);
  assert.deepEqual(room.iceServers, [{ urls: "stun:stun.l.google.com:19302" }]);
});

test("verifies a correct PIN and returns a viewer token", () => {
  const store = createStore();
  const room = store.createRoom();
  const result = store.verifyPin(room.roomId, room.pin);
  assert.equal(result.roomId, room.roomId);
  assert.ok(result.viewerToken.length > 20);
});

test("rejects an expired room", () => {
  let now = 1000;
  const store = createStore(() => now);
  const room = store.createRoom();
  now = 62000;
  assert.throws(() => store.verifyPin(room.roomId, room.pin), /ROOM_EXPIRED/);
});

test("locks after repeated wrong PIN attempts", () => {
  const store = createStore();
  const room = store.createRoom();
  assert.throws(() => store.verifyPin(room.roomId, "000000"), /PIN_INVALID/);
  assert.throws(() => store.verifyPin(room.roomId, "111111"), /PIN_LOCKED/);
});
```

- [ ] **Step 5: Add HTTP routes**

Create `packages/server/src/http.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RoomStore } from "./store.js";

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}

export async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  store: RoomStore
): Promise<void> {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "POST" && req.url === "/rooms") {
    return sendJson(res, 201, store.createRoom());
  }
  if (req.method === "POST" && req.url === "/rooms/verify-pin") {
    const body = await readJson<{ roomId: string; pin: string }>(req);
    try {
      return sendJson(res, 200, store.verifyPin(body.roomId, body.pin));
    } catch (error) {
      return sendJson(res, 400, {
        code: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      });
    }
  }
  sendJson(res, 404, { code: "NOT_FOUND" });
}
```

Create `packages/server/src/index.ts`:

```ts
import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { handleHttp } from "./http.js";
import { RoomStore } from "./store.js";

const config = loadConfig(process.env);
const store = new RoomStore({
  publicHttpUrl: config.publicHttpUrl,
  roomTtlMs: config.roomTtlMs,
  pinMaxAttempts: config.pinMaxAttempts,
  iceServers: config.iceServers,
  now: () => Date.now()
});

const server = createServer((req, res) => {
  void handleHttp(req, res, store);
});

server.listen(config.port, config.host, () => {
  console.log(`signaling server listening on ${config.host}:${config.port}`);
});
```

- [ ] **Step 6: Run server tests**

Run:

```bash
npm install
npm run build --workspace @phone-monitor/shared
npm run build --workspace @phone-monitor/server
npm run test --workspace @phone-monitor/server
```

Expected: server build succeeds and room store tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add package.json package-lock.json packages/server packages/shared
git commit -m "Create short-lived signaling room API" \
  -m "The camera and viewer need a small cloud coordination point before WebRTC can connect across networks. This commit adds the server package, room store, PIN verification endpoint, ICE config return path, and store tests." \
  -m "Constraint: The server must not store video or screenshots" \
  -m "Rejected: Account-based auth in Version 1 | QR plus PIN is enough for the first validation loop" \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test --workspace @phone-monitor/server" \
  -m "Not-tested: WebSocket signaling and browser clients are not created yet"
```

## Task 4: WebSocket Signaling

**Files:**
- Create: `packages/server/src/ws.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/test/signaling-contract.test.ts`

- [ ] **Step 1: Implement signaling message validation and routing**

Create `packages/server/src/ws.ts`:

```ts
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { SignalingMessage } from "@phone-monitor/shared";
import type { RoomStore } from "./store.js";

type PeerRole = "camera" | "viewer";

interface Peer {
  role: PeerRole;
  roomId: string;
  socket: WebSocket;
}

export function createSignalingServer(server: HttpServer, store: RoomStore): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const peers = new Map<string, Peer[]>();

  function send(socket: WebSocket, message: SignalingMessage): void {
    socket.send(JSON.stringify(message));
  }

  function roomPeers(roomId: string): Peer[] {
    const list = peers.get(roomId) ?? [];
    peers.set(roomId, list);
    return list;
  }

  function forward(sender: Peer, message: SignalingMessage): void {
    for (const peer of roomPeers(sender.roomId)) {
      if (peer.socket !== sender.socket && peer.socket.readyState === peer.socket.OPEN) {
        send(peer.socket, message);
      }
    }
  }

  wss.on("connection", (socket) => {
    let currentPeer: Peer | undefined;

    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as SignalingMessage;

      if (message.type === "join-camera") {
        if (!store.hasRoom(message.roomId)) {
          return send(socket, { type: "error", code: "ROOM_NOT_FOUND", message: "Room expired or not found" });
        }
        currentPeer = { role: "camera", roomId: message.roomId, socket };
        roomPeers(message.roomId).push(currentPeer);
        return;
      }

      if (message.type === "join-viewer") {
        if (!store.consumeViewerToken(message.roomId, message.viewerToken)) {
          return send(socket, { type: "error", code: "VIEWER_REJECTED", message: "Viewer token rejected" });
        }
        currentPeer = { role: "viewer", roomId: message.roomId, socket };
        roomPeers(message.roomId).push(currentPeer);
        forward(currentPeer, message);
        return;
      }

      if (!currentPeer) {
        return send(socket, { type: "error", code: "JOIN_REQUIRED", message: "Join a room before signaling" });
      }

      forward(currentPeer, message);
    });

    socket.on("close", () => {
      if (!currentPeer) return;
      const nextPeers = roomPeers(currentPeer.roomId).filter((peer) => peer.socket !== socket);
      peers.set(currentPeer.roomId, nextPeers);
      if (currentPeer.role === "viewer") store.releaseViewer(currentPeer.roomId);
      for (const peer of nextPeers) {
        send(peer.socket, {
          type: "peer-left",
          roomId: currentPeer.roomId,
          role: currentPeer.role
        });
      }
    });
  });
}
```

Update `packages/server/src/index.ts`:

```ts
import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { handleHttp } from "./http.js";
import { RoomStore } from "./store.js";
import { createSignalingServer } from "./ws.js";

const config = loadConfig(process.env);
const store = new RoomStore({
  publicHttpUrl: config.publicHttpUrl,
  roomTtlMs: config.roomTtlMs,
  pinMaxAttempts: config.pinMaxAttempts,
  iceServers: config.iceServers,
  now: () => Date.now()
});

const server = createServer((req, res) => {
  void handleHttp(req, res, store);
});

createSignalingServer(server, store);

server.listen(config.port, config.host, () => {
  console.log(`signaling server listening on ${config.host}:${config.port}`);
});
```

- [ ] **Step 2: Add a contract test for message shape**

Create `packages/server/test/signaling-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage } from "@phone-monitor/shared";

test("offer message carries room ID and SDP", () => {
  const message: SignalingMessage = {
    type: "offer",
    roomId: "room-1",
    sdp: { type: "offer", sdp: "v=0\r\n" }
  };
  assert.equal(message.type, "offer");
  assert.equal(message.sdp.type, "offer");
});

test("viewer join message carries an admission token", () => {
  const message: SignalingMessage = {
    type: "join-viewer",
    roomId: "room-1",
    viewerToken: "viewer-token"
  };
  assert.equal(message.viewerToken, "viewer-token");
});
```

- [ ] **Step 3: Build and test signaling server**

Run:

```bash
npm run build --workspace @phone-monitor/server
npm run test --workspace @phone-monitor/server
```

Expected: server builds and contract tests pass.

- [ ] **Step 4: Commit Task 4**

```bash
git add packages/server
git commit -m "Route WebRTC signaling between paired peers" \
  -m "WebRTC requires a temporary message channel for join, offer, answer, ICE, and peer-leave messages. This commit adds WebSocket signaling tied to verified room state and keeps media out of the server." \
  -m "Constraint: Signaling can route metadata but must not process video frames" \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test --workspace @phone-monitor/server" \
  -m "Not-tested: Live browser WebRTC connection is not created yet"
```

## Task 5: PWA Shell and API Client

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/public/manifest.webmanifest`
- Create: `packages/web/src/config.ts`
- Create: `packages/web/src/api.ts`
- Create: `packages/web/src/styles.css`
- Create: `packages/web/src/main.ts`

- [ ] **Step 1: Create web package configuration**

Create `packages/web/package.json`:

```json
{
  "name": "@phone-monitor/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite --host 0.0.0.0",
    "test": "node --test dist/test/*.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@phone-monitor/shared": "0.1.0",
    "qrcode": "^1.5.3",
    "vite": "^5.2.0"
  },
  "devDependencies": {
    "@types/qrcode": "^1.5.5"
  }
}
```

Create `packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist"
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*.ts", "test/**/*.ts", "vite.config.ts"]
}
```

Create `packages/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173
  }
});
```

- [ ] **Step 2: Add the HTML shell and PWA manifest**

Create `packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f766e" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Phone Monitor</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `packages/web/public/manifest.webmanifest`:

```json
{
  "name": "Phone Monitor",
  "short_name": "Monitor",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0f766e",
  "icons": []
}
```

- [ ] **Step 3: Add config and API client**

Create `packages/web/src/config.ts`:

```ts
export interface ClientConfig {
  httpUrl: string;
  wsUrl: string;
}

export function loadClientConfig(): ClientConfig {
  return {
    httpUrl: import.meta.env.VITE_SIGNALING_HTTP_URL ?? "http://localhost:8787",
    wsUrl: import.meta.env.VITE_SIGNALING_WS_URL ?? "ws://localhost:8787/ws"
  };
}
```

Create `packages/web/src/api.ts`:

```ts
import type { CreateRoomResponse, VerifyPinResponse } from "@phone-monitor/shared";
import type { ClientConfig } from "./config.js";

export async function createRoom(config: ClientConfig): Promise<CreateRoomResponse> {
  const response = await fetch(`${config.httpUrl}/rooms`, { method: "POST" });
  if (!response.ok) throw new Error("Could not create monitoring room");
  return response.json() as Promise<CreateRoomResponse>;
}

export async function verifyPin(
  config: ClientConfig,
  roomId: string,
  pin: string
): Promise<VerifyPinResponse> {
  const response = await fetch(`${config.httpUrl}/rooms/verify-pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, pin })
  });
  if (!response.ok) {
    const body = (await response.json()) as { code?: string };
    throw new Error(body.code ?? "PIN verification failed");
  }
  return response.json() as Promise<VerifyPinResponse>;
}
```

- [ ] **Step 4: Add shell UI routing**

Create `packages/web/src/styles.css`:

```css
:root {
  color: #0f172a;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.actions {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

button {
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  background: #0f766e;
  color: white;
  font-weight: 700;
}

.status {
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: #e0f2fe;
}

.danger {
  background: #b91c1c;
}

video {
  width: 100%;
  max-height: 70vh;
  background: #020617;
  border-radius: 8px;
}
```

Create `packages/web/src/main.ts`:

```ts
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

function renderHome(): void {
  app.innerHTML = `
    <section class="app-shell">
      <h1>Phone Monitor</h1>
      <p>Use an idle phone as a visible live monitoring camera.</p>
      <div class="actions">
        <button id="camera">Use this phone as camera</button>
        <button id="viewer">Watch a camera</button>
      </div>
    </section>
  `;
  document.querySelector("#camera")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=camera");
    renderHome();
  });
  document.querySelector("#viewer")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=viewer");
    renderHome();
  });
}

renderHome();
```

- [ ] **Step 5: Build web shell**

Run:

```bash
npm install
npm run build --workspace @phone-monitor/web
```

Expected: Vite build succeeds.

- [ ] **Step 6: Commit Task 5**

```bash
git add package.json package-lock.json packages/web
git commit -m "Add browser shell for camera and viewer flows" \
  -m "The product needs a PWA surface before camera and viewer behavior can be attached. This commit adds the Vite package, installable manifest, config loading, API client, and initial route shell." \
  -m "Constraint: Version 1 must run in ordinary mobile and desktop browsers" \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run build --workspace @phone-monitor/web" \
  -m "Not-tested: Camera and viewer flows are not wired yet"
```

## Task 6: Browser Signaling and WebRTC Adapter

**Files:**
- Create: `packages/web/src/signaling-client.ts`
- Create: `packages/web/src/webrtc.ts`
- Create: `packages/web/test/webrtc-state.test.ts`

- [ ] **Step 1: Add browser signaling client**

Create `packages/web/src/signaling-client.ts`:

```ts
import type { SignalingMessage } from "@phone-monitor/shared";

export class SignalingClient {
  private socket?: WebSocket;
  private readonly listeners = new Set<(message: SignalingMessage) => void>();

  constructor(private readonly wsUrl: string) {}

  connect(): Promise<void> {
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as SignalingMessage;
      for (const listener of this.listeners) listener(message);
    });
    return new Promise((resolve, reject) => {
      this.socket?.addEventListener("open", () => resolve(), { once: true });
      this.socket?.addEventListener("error", () => reject(new Error("Signaling connection failed")), { once: true });
    });
  }

  onMessage(listener: (message: SignalingMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message: SignalingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Signaling socket is not open");
    }
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket?.close();
  }
}
```

- [ ] **Step 2: Add WebRTC adapter**

Create `packages/web/src/webrtc.ts`:

```ts
import type { IceServerConfig, SignalingMessage } from "@phone-monitor/shared";
import { mapIceStateToUserState, type UserFacingConnectionState } from "@phone-monitor/shared";
import type { SignalingClient } from "./signaling-client.js";

export interface PeerController {
  peer: RTCPeerConnection;
  close: () => void;
}

export function createPeer(params: {
  iceServers: IceServerConfig[];
  signaling: SignalingClient;
  roomId: string;
  onState: (state: UserFacingConnectionState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}): PeerController {
  const peer = new RTCPeerConnection({ iceServers: params.iceServers });
  let relayActive = false;

  peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      params.signaling.send({
        type: "ice-candidate",
        roomId: params.roomId,
        candidate: event.candidate.toJSON()
      });
    }
  });

  peer.addEventListener("iceconnectionstatechange", () => {
    relayActive = peer.getStats ? relayActive : false;
    params.onState(mapIceStateToUserState(peer.iceConnectionState, relayActive));
  });

  peer.addEventListener("track", (event) => {
    const [stream] = event.streams;
    if (stream) params.onRemoteStream?.(stream);
  });

  params.signaling.onMessage((message: SignalingMessage) => {
    void handlePeerMessage(peer, message);
  });

  return {
    peer,
    close: () => peer.close()
  };
}

async function handlePeerMessage(
  peer: RTCPeerConnection,
  message: SignalingMessage
): Promise<void> {
  if (message.type === "offer" || message.type === "answer") {
    await peer.setRemoteDescription(message.sdp);
  }
  if (message.type === "ice-candidate") {
    await peer.addIceCandidate(message.candidate);
  }
}
```

- [ ] **Step 3: Add a narrow state test**

Create `packages/web/test/webrtc-state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapIceStateToUserState } from "@phone-monitor/shared";

test("browser code uses shared relay state naming", () => {
  assert.equal(mapIceStateToUserState("connected", true), "Using relay connection");
});
```

- [ ] **Step 4: Build and test web adapter**

Run:

```bash
npm run build --workspace @phone-monitor/web
npm run test --workspace @phone-monitor/web
```

Expected: web build succeeds and state test passes.

- [ ] **Step 5: Commit Task 6**

```bash
git add packages/web
git commit -m "Add browser signaling and WebRTC adapters" \
  -m "Camera and viewer screens need focused adapters so UI code does not own low-level socket or peer-connection details. This commit adds the browser signaling client and WebRTC adapter." \
  -m "Constraint: WebRTC media must remain outside the signaling server" \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test --workspace @phone-monitor/web" \
  -m "Not-tested: Live offer/answer exchange is wired in the next task"
```

## Task 7: Camera PWA Flow

**Files:**
- Create: `packages/web/src/camera.ts`
- Create: `packages/web/src/safety.ts`
- Modify: `packages/web/src/main.ts`

- [ ] **Step 1: Add safety helpers**

Create `packages/web/src/safety.ts`:

```ts
export async function requestWakeLock(): Promise<WakeLockSentinel | undefined> {
  if (!("wakeLock" in navigator)) return undefined;
  return navigator.wakeLock.request("screen");
}

export function describeCameraError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Camera permission was denied. Allow camera access and start monitoring again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  return "The camera could not start. Close other camera apps and try again.";
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
```

- [ ] **Step 2: Add Camera PWA screen**

Create `packages/web/src/camera.ts`:

```ts
import QRCode from "qrcode";
import type { CreateRoomResponse } from "@phone-monitor/shared";
import { createRoom } from "./api.js";
import { loadClientConfig } from "./config.js";
import { SignalingClient } from "./signaling-client.js";
import { createPeer } from "./webrtc.js";
import { describeCameraError, requestWakeLock, stopStream } from "./safety.js";

export async function renderCamera(app: HTMLElement): Promise<void> {
  const config = loadClientConfig();
  app.innerHTML = `
    <section class="app-shell">
      <h1>Camera</h1>
      <p class="status" id="status">Starting camera...</p>
      <video id="preview" autoplay muted playsinline></video>
      <canvas id="qr"></canvas>
      <p id="pin"></p>
      <button class="danger" id="stop">Stop monitoring</button>
    </section>
  `;

  const status = app.querySelector<HTMLParagraphElement>("#status")!;
  const preview = app.querySelector<HTMLVideoElement>("#preview")!;
  const qr = app.querySelector<HTMLCanvasElement>("#qr")!;
  const pin = app.querySelector<HTMLParagraphElement>("#pin")!;
  const stop = app.querySelector<HTMLButtonElement>("#stop")!;

  let stream: MediaStream | undefined;
  let signaling: SignalingClient | undefined;

  try {
    await requestWakeLock();
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    preview.srcObject = stream;
    const room: CreateRoomResponse = await createRoom(config);
    await QRCode.toCanvas(qr, room.qrPayload);
    pin.textContent = `PIN: ${room.pin}`;
    status.textContent = "Camera is visible and waiting for a viewer.";

    signaling = new SignalingClient(config.wsUrl);
    await signaling.connect();
    signaling.send({ type: "join-camera", roomId: room.roomId });

    const peerController = createPeer({
      iceServers: room.iceServers,
      signaling,
      roomId: room.roomId,
      onState: (state) => {
        status.textContent = state;
      }
    });

    for (const track of stream.getTracks()) {
      peerController.peer.addTrack(track, stream);
    }

    signaling.onMessage((message) => {
      if (message.type === "join-viewer") {
        void peerController.peer.createOffer().then(async (offer) => {
          await peerController.peer.setLocalDescription(offer);
          signaling?.send({ type: "offer", roomId: room.roomId, sdp: offer });
        });
      }
    });

    stop.addEventListener("click", () => {
      peerController.close();
      signaling?.send({ type: "session-ended", roomId: room.roomId, reason: "Camera stopped monitoring" });
      signaling?.close();
      if (stream) stopStream(stream);
      status.textContent = "Session ended";
    });
  } catch (error) {
    status.textContent = describeCameraError(error);
    if (stream) stopStream(stream);
    signaling?.close();
  }
}
```

- [ ] **Step 3: Route camera mode**

Modify `packages/web/src/main.ts`:

```ts
import "./styles.css";
import { renderCamera } from "./camera.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

function renderHome(): void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "camera") {
    void renderCamera(app);
    return;
  }

  app.innerHTML = `
    <section class="app-shell">
      <h1>Phone Monitor</h1>
      <p>Use an idle phone as a visible live monitoring camera.</p>
      <div class="actions">
        <button id="camera">Use this phone as camera</button>
        <button id="viewer">Watch a camera</button>
      </div>
    </section>
  `;
  document.querySelector("#camera")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=camera");
    renderHome();
  });
  document.querySelector("#viewer")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=viewer");
    renderHome();
  });
}

renderHome();
```

- [ ] **Step 4: Build camera flow**

Run:

```bash
npm run build --workspace @phone-monitor/web
```

Expected: web build succeeds.

- [ ] **Step 5: Commit Task 7**

```bash
git add packages/web
git commit -m "Create visible camera-side monitoring flow" \
  -m "The old phone must visibly start camera capture, create a room, show QR plus PIN, and stop cleanly. This commit adds the Camera PWA flow, wake-lock request, media cleanup, and safety messaging." \
  -m "Constraint: Version 1 must not behave like hidden monitoring" \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run build --workspace @phone-monitor/web" \
  -m "Not-tested: Real mobile camera permission behavior requires manual device validation"
```

## Task 8: Viewer PWA Flow

**Files:**
- Create: `packages/web/src/viewer.ts`
- Modify: `packages/web/src/main.ts`

- [ ] **Step 1: Add Viewer PWA screen**

Create `packages/web/src/viewer.ts`:

```ts
import { verifyPin } from "./api.js";
import { loadClientConfig } from "./config.js";
import { SignalingClient } from "./signaling-client.js";
import { createPeer } from "./webrtc.js";

export function renderViewer(app: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get("room") ?? "";
  app.innerHTML = `
    <section class="app-shell">
      <h1>Viewer</h1>
      <p class="status" id="status">Enter the room and PIN from the camera phone.</p>
      <label>Room <input id="room" value="${initialRoom}" /></label>
      <label>PIN <input id="pin" inputmode="numeric" maxlength="6" /></label>
      <button id="connect">Connect</button>
      <video id="remote" autoplay playsinline controls></video>
      <button class="danger" id="disconnect">Disconnect</button>
    </section>
  `;

  const config = loadClientConfig();
  const roomInput = app.querySelector<HTMLInputElement>("#room")!;
  const pinInput = app.querySelector<HTMLInputElement>("#pin")!;
  const status = app.querySelector<HTMLParagraphElement>("#status")!;
  const video = app.querySelector<HTMLVideoElement>("#remote")!;
  const connect = app.querySelector<HTMLButtonElement>("#connect")!;
  const disconnect = app.querySelector<HTMLButtonElement>("#disconnect")!;
  let signaling: SignalingClient | undefined;
  let peer: RTCPeerConnection | undefined;

  connect.addEventListener("click", () => {
    void (async () => {
      status.textContent = "Checking PIN";
      const roomId = roomInput.value.trim();
      const verified = await verifyPin(config, roomId, pinInput.value.trim());
      signaling = new SignalingClient(config.wsUrl);
      await signaling.connect();

      const controller = createPeer({
        iceServers: verified.iceServers,
        signaling,
        roomId,
        onState: (state) => {
          status.textContent = state;
        },
        onRemoteStream: (stream) => {
          video.srcObject = stream;
        }
      });
      peer = controller.peer;

      signaling.onMessage((message) => {
        if (message.type === "offer") {
          void controller.peer.setRemoteDescription(message.sdp).then(async () => {
            const answer = await controller.peer.createAnswer();
            await controller.peer.setLocalDescription(answer);
            signaling?.send({ type: "answer", roomId, sdp: answer });
          });
        }
        if (message.type === "peer-left" || message.type === "session-ended") {
          status.textContent = "Camera offline";
        }
      });

      signaling.send({ type: "join-viewer", roomId, viewerToken: verified.viewerToken });
      status.textContent = "Connecting";
    })().catch((error) => {
      status.textContent = error instanceof Error ? error.message : "Could not connect";
    });
  });

  disconnect.addEventListener("click", () => {
    peer?.close();
    signaling?.close();
    status.textContent = "Session ended";
  });
}
```

- [ ] **Step 2: Route viewer mode**

Modify `packages/web/src/main.ts`:

```ts
import "./styles.css";
import { renderCamera } from "./camera.js";
import { renderViewer } from "./viewer.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

function renderHome(): void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "camera") {
    void renderCamera(app);
    return;
  }
  if (mode === "viewer" || params.has("room")) {
    renderViewer(app);
    return;
  }

  app.innerHTML = `
    <section class="app-shell">
      <h1>Phone Monitor</h1>
      <p>Use an idle phone as a visible live monitoring camera.</p>
      <div class="actions">
        <button id="camera">Use this phone as camera</button>
        <button id="viewer">Watch a camera</button>
      </div>
    </section>
  `;
  document.querySelector("#camera")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=camera");
    renderHome();
  });
  document.querySelector("#viewer")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/?mode=viewer");
    renderHome();
  });
}

renderHome();
```

- [ ] **Step 3: Build viewer flow**

Run:

```bash
npm run build --workspace @phone-monitor/web
```

Expected: web build succeeds.

- [ ] **Step 4: Commit Task 8**

```bash
git add packages/web
git commit -m "Create PIN-gated viewer flow" \
  -m "Remote viewing needs a simple browser-side admission flow before WebRTC playback starts. This commit adds the viewer screen, PIN verification call, viewer signaling join, answer creation, remote stream playback, and disconnect state." \
  -m "Constraint: QR links alone must not grant access without the PIN" \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run build --workspace @phone-monitor/web" \
  -m "Not-tested: End-to-end camera-to-viewer WebRTC requires the smoke test and device validation tasks"
```

## Task 9: Browser Smoke Test and Manual Validation Guide

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/remote-live.spec.ts`
- Create: `docs/testing/manual-remote-validation.md`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Desktop Chrome"],
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    }
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://localhost:8787/health",
      reuseExistingServer: true
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:5173",
      reuseExistingServer: true
    }
  ]
});
```

Modify root `package.json` scripts:

```json
{
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:server": "npm run dev --workspace @phone-monitor/server",
    "dev:web": "npm run dev --workspace @phone-monitor/web",
    "test": "npm run test --workspaces",
    "test:e2e": "playwright test",
    "typecheck": "npm run typecheck --workspaces"
  }
}
```

- [ ] **Step 2: Add browser smoke test**

Create `e2e/remote-live.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("camera page creates a visible monitoring session", async ({ page }) => {
  await page.goto("/?mode=camera");
  await expect(page.getByRole("heading", { name: "Camera" })).toBeVisible();
  await expect(page.getByText(/PIN:/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/waiting for a viewer/i)).toBeVisible();
});

test("viewer page shows PIN-gated connection UI", async ({ page }) => {
  await page.goto("/?mode=viewer");
  await expect(page.getByRole("heading", { name: "Viewer" })).toBeVisible();
  await expect(page.getByLabel("Room")).toBeVisible();
  await expect(page.getByLabel("PIN")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
});
```

- [ ] **Step 3: Add manual remote validation guide**

Create `docs/testing/manual-remote-validation.md`:

```markdown
# Manual Remote Validation

## Required Devices

- One old Android phone for Camera PWA.
- One viewer phone with mobile data enabled.
- One desktop browser for debugging.
- A deployed HTTPS URL for the PWA and signaling service.
- STUN/TURN credentials configured in `ICE_SERVERS_JSON`.

## Checks

1. Camera phone on home Wi-Fi opens the Camera PWA.
2. Camera permission is granted.
3. Camera phone remains plugged in, foregrounded, and screen-on.
4. Viewer phone disables Wi-Fi and uses mobile data.
5. Viewer scans QR or opens the room link.
6. Viewer enters the PIN shown on the camera phone.
7. Live video appears within 20 seconds.
8. If direct connection fails, the session enters a relayed connection and still plays.
9. Closing the camera page changes the viewer state to camera offline.
10. Wrong PIN shows a clear error and does not start playback.
11. Expired room requires regenerating QR and PIN on the camera phone.
12. A 30-60 minute screen-on session remains live or reconnects with a clear state.

## Evidence To Capture

- Browser console has no uncaught runtime errors.
- Server logs show room creation, viewer join, and session end.
- Metrics record whether TURN relay was used.
- User-facing state text matches the observed connection behavior.
```

- [ ] **Step 4: Run automated checks**

Run:

```bash
npm run build
npm run test
npm run test:e2e
```

Expected: build succeeds, unit tests pass, Playwright smoke tests pass.

- [ ] **Step 5: Commit Task 9**

```bash
git add package.json playwright.config.ts e2e docs/testing
git commit -m "Add smoke and device validation for remote viewing" \
  -m "The first version is only useful if the browser surfaces and remote monitoring assumptions can be checked repeatedly. This commit adds Playwright smoke coverage and a manual device validation checklist for home Wi-Fi, mobile data, TURN fallback, and foreground stability." \
  -m "Constraint: Real remote WebRTC reliability cannot be proven by unit tests alone" \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test:e2e" \
  -m "Not-tested: Manual mobile-data and TURN relay validation still requires deployed infrastructure"
```

## Task 10: Operational Notes and Cost Guardrails

**Files:**
- Create: `docs/operations/turn-and-signaling.md`
- Modify: `docs/superpowers/specs/2026-04-26-remote-phone-monitoring-design.md`

- [ ] **Step 1: Document deployment and TURN guardrails**

Create `docs/operations/turn-and-signaling.md`:

```markdown
# TURN and Signaling Operations

## Runtime Components

- PWA host served over HTTPS.
- Signaling API with WebSocket support.
- STUN/TURN service reachable from mobile networks.

## Required Environment

- `PUBLIC_SIGNALING_HTTP_URL`: public HTTPS signaling API URL.
- `PUBLIC_SIGNALING_WS_URL`: public WSS signaling WebSocket URL.
- `ICE_SERVERS_JSON`: JSON array of STUN and TURN servers.
- `ROOM_TTL_SECONDS`: short room lifetime, default 600.
- `PIN_MAX_ATTEMPTS`: bounded PIN attempts, default 5.

## Cost Guardrails

- Track session duration.
- Track whether a session used direct or relayed connectivity.
- Track aggregate TURN relay minutes.
- Keep one viewer per camera session in Version 1.
- Prefer video constraints that fit mobile uplink, such as 720p or lower during early validation.

## Privacy Guardrails

- Do not log SDP payload contents in production logs.
- Do not store video, screenshots, or frame data.
- Keep room state short-lived.
- Keep camera-side monitoring status visible.
```

Update the spec with a short operations reference under `Main Risks`:

```markdown
- TURN relay cost and privacy controls are tracked in `docs/operations/turn-and-signaling.md`.
```

- [ ] **Step 2: Commit Task 10**

```bash
git add docs/operations docs/superpowers/specs/2026-04-26-remote-phone-monitoring-design.md
git commit -m "Document TURN cost and privacy guardrails" \
  -m "Remote viewing depends on TURN when direct WebRTC cannot connect, so operators need a clear cost and privacy baseline before deployment. This commit documents required environment variables, relay metrics, and logging boundaries." \
  -m "Constraint: TURN improves reliability but introduces bandwidth cost" \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: Documentation reviewed against the approved design spec" \
  -m "Not-tested: No deployment exists yet"
```

## Final Verification

- [ ] Run `npm install`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test`.
- [ ] Run `npm run test:e2e`.
- [ ] Start local server and web app with `npm run dev:server` and `npm run dev:web`.
- [ ] Open `http://localhost:5173/?mode=camera` in one browser tab.
- [ ] Open `http://localhost:5173/?mode=viewer` in another browser tab.
- [ ] Confirm camera room creation, PIN display, viewer PIN entry, and live fake-media playback in local smoke testing.
- [ ] Complete `docs/testing/manual-remote-validation.md` after deployment to HTTPS with real STUN/TURN configuration.

