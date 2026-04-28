# Two-Phone Local-First Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Version 1 so ordinary users experience the app as a two-phone product with same-Wi-Fi direct mode first, hosted remote signaling as fallback, and UI work gated by an approved image-generated design mockup.

**Architecture:** Keep the existing TypeScript workspace and WebRTC signaling stack. Add a small connection-mode layer that labels and selects nearby versus remote behavior, keep hosted signaling as product-owned infrastructure, and update UI copy so users never see server setup language. Major frontend redesign must start with an image-generated UI mockup and wait for user approval before CSS/markup implementation.

**Tech Stack:** TypeScript, Vite, vanilla browser APIs, WebRTC, WebSocket, Node test runner, Playwright, built-in image generation workflow for UI mockups.

---

## Scope Check

This plan does not remove the hosted signaling server. It changes the product contract: ordinary users should not deploy or configure servers. Fully local same-Wi-Fi signaling may be limited by browser APIs, so hosted signaling remains an acceptable fallback when local coordination is unreliable.

## File Structure

- Modify `docs/superpowers/specs/2026-04-26-remote-phone-monitoring-design.md`: product architecture now says two-phone first, same-Wi-Fi first, hosted remote fallback.
- Modify `docs/operations/turn-and-signaling.md`: describe signaling/TURN as product-operated infrastructure, not user setup.
- Modify `docs/testing/manual-remote-validation.md`: split same-Wi-Fi validation from remote mobile-data validation.
- Modify `packages/shared/src/types.ts`: add connection mode types and user-facing labels.
- Modify `packages/shared/src/index.ts`: export new mode helpers if a new shared file is added.
- Create `packages/shared/src/connection-mode.ts`: pure helpers for mode labels and fallback state.
- Create `packages/shared/test/connection-mode.test.ts`: test user-facing labels and fallback mapping.
- Create `packages/web/src/connection-mode.ts`: browser-facing mode selection and display helpers.
- Create `packages/web/test/connection-mode.test.ts`: test nearby/remote route and config behavior.
- Modify `packages/web/src/main.ts`, `packages/web/src/camera.ts`, `packages/web/src/viewer.ts`: replace server-centric wording with two-phone wording and surface nearby/remote status.
- Modify `packages/web/src/styles.css`: only after UI mockup approval, restyle to match the approved mockup.
- Create `docs/design/phone-monitor-ui-reference.md`: record generated design prompt, selected image path, and user approval status.
- Create `docs/design/assets/phone-monitor-ui-approved.png`: saved approved mockup reference after image generation and user approval.

## Task 1: UI Design Mockup Approval Gate

**Files:**
- Create: `docs/design/phone-monitor-ui-reference.md`
- Create after generation and user approval: `docs/design/assets/phone-monitor-ui-approved.png`

- [ ] **Step 1: Generate the first UI mockup with image generation**

Use the built-in image generation workflow, not a hand-drawn static sketch. Generate a mobile-first UI mockup using this prompt:

```text
Use case: ui-mockup
Asset type: mobile PWA design reference for a phone monitoring app
Primary request: Create a polished mobile app UI mockup for a two-phone live monitoring product. Show three mobile screens side by side: Home, Camera pairing, Viewer live view.
Scene/backdrop: Clean product UI presentation on a plain light background, no device hardware frame required.
Subject: A practical household monitoring app where one old phone becomes a visible camera and another phone watches it.
Style/medium: High-fidelity modern mobile app UI, quiet utility design, production-ready, not a marketing landing page.
Composition/framing: Three tall phone-sized screens aligned horizontally. Home screen emphasizes two actions: use this phone as camera, watch a camera. Camera screen shows live preview area, QR code block, large PIN, visible monitoring status, stop button. Viewer screen shows live video area, connection mode status, room/PIN entry or connected state, disconnect button.
Color palette: Neutral white and soft gray surfaces with teal primary actions, red destructive action, small amber status accent; avoid one-note teal-only design.
Text (verbatim): "Phone Monitor", "Use this phone as camera", "Watch a camera", "Same Wi-Fi", "Remote", "PIN 482913", "Live", "Stop", "Disconnect"
Constraints: Make all text legible. Do not include server setup wording. Do not include hidden monitoring language. Use simple icons where useful. Keep controls thumb-friendly and mobile-safe.
Avoid: dark blue/slate dominant palette, purple gradients, oversized marketing hero, decorative blobs, nested cards, fake brand logos, watermarks.
```

Expected: A clear raster mockup suitable for user review.

- [ ] **Step 2: Ask for user approval before implementation**

Stop after showing the generated design. Ask:

```text
Do you approve this UI mockup for frontend implementation? If yes, implement the frontend to match this design. If no, revise the mockup before touching UI code.
```

Expected: No frontend UI implementation happens until the user explicitly approves one design.

- [ ] **Step 3: Save the approved design reference**

After approval, create `docs/design/phone-monitor-ui-reference.md`:

````markdown
# Phone Monitor UI Reference

## Status

Approved by user before frontend implementation.

## Design Intent

- Two-phone product, not server administration.
- Same-Wi-Fi and remote modes are visible in plain language.
- Camera monitoring is visibly active and easy to stop.
- Viewer live screen prioritizes video, connection state, and disconnect.

## Approved Prompt

```text
Use case: ui-mockup
Asset type: mobile PWA design reference for a phone monitoring app
Primary request: Create a polished mobile app UI mockup for a two-phone live monitoring product. Show three mobile screens side by side: Home, Camera pairing, Viewer live view.
Scene/backdrop: Clean product UI presentation on a plain light background, no device hardware frame required.
Subject: A practical household monitoring app where one old phone becomes a visible camera and another phone watches it.
Style/medium: High-fidelity modern mobile app UI, quiet utility design, production-ready, not a marketing landing page.
Composition/framing: Three tall phone-sized screens aligned horizontally. Home screen emphasizes two actions: use this phone as camera, watch a camera. Camera screen shows live preview area, QR code block, large PIN, visible monitoring status, stop button. Viewer screen shows live video area, connection mode status, room/PIN entry or connected state, disconnect button.
Color palette: Neutral white and soft gray surfaces with teal primary actions, red destructive action, small amber status accent; avoid one-note teal-only design.
Text (verbatim): "Phone Monitor", "Use this phone as camera", "Watch a camera", "Same Wi-Fi", "Remote", "PIN 482913", "Live", "Stop", "Disconnect"
Constraints: Make all text legible. Do not include server setup wording. Do not include hidden monitoring language. Use simple icons where useful. Keep controls thumb-friendly and mobile-safe.
Avoid: dark blue/slate dominant palette, purple gradients, oversized marketing hero, decorative blobs, nested cards, fake brand logos, watermarks.
```

## Approved Asset

`docs/design/assets/phone-monitor-ui-approved.png`
````

Expected: The final design reference is preserved in the repo before CSS/markup work starts.

## Task 2: Shared Connection Mode Contract

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `packages/shared/src/connection-mode.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/connection-mode.test.ts`

- [ ] **Step 1: Add shared connection mode types**

Update `packages/shared/src/types.ts` with:

```ts
export type ConnectionMode = "nearby" | "remote";

export type ConnectionModeLabel =
  | "Same Wi-Fi"
  | "Remote"
  | "Checking connection"
  | "Falling back to remote";
```

Expected: Shared code can describe nearby and remote modes without exposing server terminology.

- [ ] **Step 2: Add pure label helpers**

Create `packages/shared/src/connection-mode.ts`:

```ts
import type { ConnectionMode, ConnectionModeLabel } from "./types.js";

export function labelConnectionMode(mode: ConnectionMode): ConnectionModeLabel {
  return mode === "nearby" ? "Same Wi-Fi" : "Remote";
}

export function labelConnectionFallback(fallbackActive: boolean): ConnectionModeLabel {
  return fallbackActive ? "Falling back to remote" : "Checking connection";
}
```

Update `packages/shared/src/index.ts`:

```ts
export * from "./types.js";
export * from "./state.js";
export * from "./pairing.js";
export * from "./deployment.js";
export * from "./connection-mode.js";
```

Expected: Mode labels are centralized and testable.

- [ ] **Step 3: Test shared labels**

Create `packages/shared/test/connection-mode.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  labelConnectionFallback,
  labelConnectionMode
} from "../src/connection-mode.js";

test("labels nearby mode as same Wi-Fi", () => {
  assert.equal(labelConnectionMode("nearby"), "Same Wi-Fi");
});

test("labels remote mode without server wording", () => {
  assert.equal(labelConnectionMode("remote"), "Remote");
});

test("labels fallback without exposing signaling details", () => {
  assert.equal(labelConnectionFallback(false), "Checking connection");
  assert.equal(labelConnectionFallback(true), "Falling back to remote");
});
```

Run:

```bash
npm run build --workspace @phone-monitor/shared
npm run test --workspace @phone-monitor/shared
```

Expected: Shared build succeeds and all shared tests pass.

## Task 3: Browser Connection Mode Layer

**Files:**
- Create: `packages/web/src/connection-mode.ts`
- Create: `packages/web/test/connection-mode.test.ts`
- Modify: `packages/web/src/config.ts`
- Modify: `packages/web/test/config.test.ts`

- [ ] **Step 1: Add browser mode configuration**

Update `packages/web/src/config.ts`:

```ts
export interface ClientConfig {
  httpUrl: string;
  wsUrl: string;
  publicViewerUrl?: string;
  preferredConnectionMode: "nearby" | "remote" | "auto";
}

export interface ClientEnv {
  VITE_SIGNALING_HTTP_URL?: string;
  VITE_SIGNALING_WS_URL?: string;
  VITE_PUBLIC_VIEWER_URL?: string;
  VITE_PREFERRED_CONNECTION_MODE?: "nearby" | "remote" | "auto";
}
```

In `loadClientConfig`, add:

```ts
preferredConnectionMode: env.VITE_PREFERRED_CONNECTION_MODE ?? "auto"
```

Expected: The web app can default to automatic mode while allowing test overrides.

- [ ] **Step 2: Add mode selection helper**

Create `packages/web/src/connection-mode.ts`:

```ts
import type { ConnectionMode } from "@phone-monitor/shared";
import { labelConnectionMode } from "@phone-monitor/shared";
import type { ClientConfig } from "./config.js";

export interface ConnectionModeDecision {
  mode: ConnectionMode;
  label: string;
  usesHostedSignaling: boolean;
}

export function chooseConnectionMode(
  config: Pick<ClientConfig, "preferredConnectionMode">
): ConnectionModeDecision {
  if (config.preferredConnectionMode === "nearby") {
    return { mode: "nearby", label: labelConnectionMode("nearby"), usesHostedSignaling: false };
  }
  if (config.preferredConnectionMode === "remote") {
    return { mode: "remote", label: labelConnectionMode("remote"), usesHostedSignaling: true };
  }
  return { mode: "nearby", label: labelConnectionMode("nearby"), usesHostedSignaling: false };
}

export function fallbackToRemote(): ConnectionModeDecision {
  return { mode: "remote", label: labelConnectionMode("remote"), usesHostedSignaling: true };
}
```

Expected: Automatic mode starts as nearby. Remote fallback remains explicit and testable.

- [ ] **Step 3: Test browser mode decisions**

Create `packages/web/test/connection-mode.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { chooseConnectionMode, fallbackToRemote } from "../src/connection-mode.js";

test("auto mode starts with same Wi-Fi nearby behavior", () => {
  assert.deepEqual(chooseConnectionMode({ preferredConnectionMode: "auto" }), {
    mode: "nearby",
    label: "Same Wi-Fi",
    usesHostedSignaling: false
  });
});

test("remote mode uses hosted signaling without saying server", () => {
  assert.deepEqual(chooseConnectionMode({ preferredConnectionMode: "remote" }), {
    mode: "remote",
    label: "Remote",
    usesHostedSignaling: true
  });
});

test("fallback switches to remote mode", () => {
  assert.deepEqual(fallbackToRemote(), {
    mode: "remote",
    label: "Remote",
    usesHostedSignaling: true
  });
});
```

Run:

```bash
npm run build --workspace @phone-monitor/web
npm run test --workspace @phone-monitor/web
```

Expected: Web build succeeds and all web tests pass.

## Task 4: Two-Phone UI Copy and Approved Mockup Implementation

**Files:**
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/camera.ts`
- Modify: `packages/web/src/viewer.ts`
- Modify: `packages/web/src/styles.css`
- Modify or create tests under `packages/web/test/*.test.ts`

- [ ] **Step 1: Confirm approved UI mockup exists**

Before editing UI markup or CSS, verify `docs/design/phone-monitor-ui-reference.md` says:

```markdown
Approved by user before frontend implementation.
```

Expected: If this approval record is missing, stop and generate/revise the UI mockup first.

- [ ] **Step 2: Replace home copy with two-phone wording**

Update home screen copy in `packages/web/src/main.ts` so it uses:

```html
<p class="eyebrow">Phone Monitor</p>
<h1>Two phones, live view</h1>
<p class="status">Pair a camera phone and a viewer phone. Same Wi-Fi connects nearby; Remote works when you are away.</p>
```

Expected: The home screen does not mention servers, signaling, TURN, NAT, or deployment.

- [ ] **Step 3: Surface connection mode on camera and viewer screens**

Use `chooseConnectionMode(loadClientConfig())` in `packages/web/src/camera.ts` and `packages/web/src/viewer.ts`. Display the label near the current status:

```html
<p class="mode-pill" id="connection-mode">Same Wi-Fi</p>
```

Expected: Users see "Same Wi-Fi" or "Remote", not implementation language.

- [ ] **Step 4: Restyle to match the approved mockup**

Update `packages/web/src/styles.css` according to the approved design reference. Keep these constraints:

```css
.mode-pill {
  border-radius: 999px;
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: 0 12px;
}
```

Expected: The frontend visually follows the approved mockup while preserving responsive mobile behavior.

- [ ] **Step 5: Add copy regression tests**

Add or update web tests to assert that rendered text includes:

```text
Two phones, live view
Same Wi-Fi
Remote
```

and does not include:

```text
server
signaling
TURN
NAT
deploy
```

Run:

```bash
npm run build --workspace @phone-monitor/web
npm run test --workspace @phone-monitor/web
```

Expected: Web build succeeds and UI copy tests pass.

## Task 5: Documentation and Manual Validation

**Files:**
- Modify: `docs/operations/turn-and-signaling.md`
- Modify: `docs/testing/manual-remote-validation.md`
- Modify: `.env.example`

- [ ] **Step 1: Reframe operations documentation**

Update `docs/operations/turn-and-signaling.md` to state:

```markdown
This document is for the product operator. Ordinary users do not deploy or configure this infrastructure.
```

Expected: Operations docs no longer read like user setup instructions.

- [ ] **Step 2: Split validation into same-Wi-Fi and remote checks**

Update `docs/testing/manual-remote-validation.md` with two checklists:

```markdown
## Same-Wi-Fi Two-Phone Validation

1. Put both phones on the same Wi-Fi.
2. Start Camera on the old phone.
3. Scan QR or open the viewer link on the second phone.
4. Enter the PIN.
5. Confirm live video starts.
6. Confirm UI labels the session as Same Wi-Fi or clearly falls back to Remote without asking for server setup.

## Remote Two-Phone Validation

1. Keep the camera phone on home Wi-Fi.
2. Put the viewer phone on mobile data.
3. Scan QR or open the viewer link.
4. Enter the PIN.
5. Confirm live video starts through the hosted remote path.
6. Confirm TURN fallback works when direct WebRTC is blocked.
```

Expected: Manual validation matches the two-phone product promise.

- [ ] **Step 3: Add preferred mode env example**

Update `.env.example`:

```bash
VITE_PREFERRED_CONNECTION_MODE=auto
```

Expected: Local development can force `nearby`, `remote`, or `auto` behavior for testing.

## Final Verification

- [ ] Run `npm run build`.
- [ ] Run `npm run test`.
- [ ] Run `npm run test:e2e`.
- [ ] Verify docs do not tell ordinary users to deploy a server.
- [ ] Verify the UI implementation did not begin before an approved image-generated design reference was recorded.
- [ ] Validate same-Wi-Fi two-phone behavior manually.
- [ ] Validate remote mobile-data behavior manually.
