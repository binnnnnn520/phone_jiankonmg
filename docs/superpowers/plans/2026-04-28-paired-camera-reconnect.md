# Paired Camera Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a viewer pair with a camera once using QR/PIN, then reconnect later from the Cameras tab without scanning or entering the PIN again.

**Architecture:** Add a long-lived pair record beside the existing short-lived room model. PIN verification creates a viewer pair token, camera room creation stores/reuses a camera pair token, and reconnect exchanges the viewer pair token for a fresh short-lived viewer token. The web app stores only device IDs and pair tokens in local storage, while the Cameras tab renders saved paired cameras and starts reconnect flows.

**Tech Stack:** TypeScript workspace, Node HTTP/WebSocket signaling server, WebRTC, browser `localStorage`, Node test runner, Playwright e2e.

---

### Task 1: Shared Pairing Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Test: `packages/server/test/store.test.ts`

- [ ] Add request/response types for `CreateRoomRequest`, `PairingInfo`, `ViewerPairedCamera`, `PairReconnectRequest`, `PairReconnectResponse`, and `PairStatusResponse`.
- [ ] Extend `CreateRoomResponse` with `cameraPairing`.
- [ ] Extend `VerifyPinRequest` and `VerifyPinResponse` with viewer device and paired camera data.
- [ ] Run `npm run build --workspace @phone-monitor/shared`.

### Task 2: Server Pair Store and HTTP Endpoints

**Files:**
- Modify: `packages/server/src/store.ts`
- Modify: `packages/server/src/http.ts`
- Test: `packages/server/test/store.test.ts`
- Test: `packages/server/test/http.test.ts`

- [ ] Write failing store tests for first-pair creation, PIN-issued viewer pair tokens, reconnect token exchange, and offline-camera rejection.
- [ ] Implement pair records in `RoomStore`; store token hashes only.
- [ ] Add `RoomStore.reconnectPair` and `RoomStore.pairStatus`.
- [ ] Add `POST /pairs/reconnect` and `POST /pairs/status`.
- [ ] Run `npm run test --workspace @phone-monitor/server`.

### Task 3: Web Pair Storage and API

**Files:**
- Create: `packages/web/src/device.ts`
- Create: `packages/web/src/paired-cameras.ts`
- Modify: `packages/web/src/api.ts`
- Test: `packages/web/test/paired-cameras.test.ts`
- Modify: `packages/web/package.json`

- [ ] Write failing tests for stable browser device ID and paired camera upsert/remove.
- [ ] Add API helpers for create-room pair metadata, PIN pairing metadata, reconnect, and status.
- [ ] Run `npm run test --workspace @phone-monitor/web`.

### Task 4: Camera and Viewer Pair Capture

**Files:**
- Modify: `packages/web/src/camera.ts`
- Modify: `packages/web/src/viewer.ts`
- Test: `packages/web/test/camera.test.ts`
- Test: `packages/web/test/viewer-session.test.ts`

- [ ] Camera sends saved camera pair token when creating rooms and saves newly returned camera pair token.
- [ ] Viewer sends its stable device ID on PIN verification and saves returned paired camera.
- [ ] Viewer can start with an existing viewer token from reconnect without PIN verification.
- [ ] Run focused web tests.

### Task 5: Cameras Tab List and Reconnect UI

**Files:**
- Modify: `packages/web/src/home.ts`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/home.test.ts`
- Test: `e2e/remote-live.spec.ts`

- [ ] Cameras tab renders saved paired devices, empty state, Reconnect buttons, and Remove buttons.
- [ ] Reconnect navigates to Viewer with `pair=<pairId>`; Viewer exchanges the saved token for a live session.
- [ ] Add e2e covering first PIN pairing, returning to Cameras tab, and reconnecting without entering PIN.
- [ ] Run `npm run build && npm run test && npm run test:e2e`.
