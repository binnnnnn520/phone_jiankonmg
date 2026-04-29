# Phone Monitor Priority Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for implementation. Steps use checkbox (`- [ ]`) syntax for tracking. Each task runs in its own git worktree and branch.

**Goal:** Add the next five prioritized product features while preserving the current two-phone monitoring flow and mobile layout stability.

**Architecture:** Keep the signaling server contract small and let the web client own user-facing recovery, device status, and preferences. Add focused browser helpers for battery, wake/visibility state, camera list presentation, and video quality so `viewer.ts`, `camera.ts`, and `home.ts` do not absorb all new behavior.

**Tech Stack:** TypeScript, Vite, Playwright, Vitest, WebRTC, browser localStorage, existing Express/WebSocket signaling server.

---

## Priority Order

1. Viewer auto reconnect after a paired camera goes offline and comes back.
2. Battery and charging status on the Me page and camera/viewer screens.
3. Background and keep-awake guidance that survives visibility changes.
4. Multi-camera list improvements for scanning, sorting, and clear status.
5. Video quality preference for lower bandwidth or sharper monitoring.

## Shared Constraints

- Do not change the bottom navigation dock height or top position on Home, Cameras, or Me.
- Do not remove existing QR + PIN pairing or paired-camera reconnect behavior.
- Keep new UI compact; this app is a phone-first monitoring tool, not a landing page.
- All new behavior needs an automated test that fails before production code changes.
- Avoid changing the same CSS blocks unnecessarily; append focused classes near related sections.
- Each worker must commit only its feature branch and list changed files.

## Task 1: Viewer Auto Reconnect

**Branch:** `feature/viewer-auto-reconnect`

**Worktree:** `.worktrees/viewer-auto-reconnect`

**Files:**
- Modify: `packages/web/src/viewer.ts`
- Test: `packages/web/test/viewer-session.test.ts`
- Test: `e2e/remote-live.spec.ts`

- [ ] **Step 1: Write a failing unit test for the reconnect controller**

Add a test that starts a paired-camera viewer session, receives `session-ended` or `peer-left`, and expects the viewer to retry `reconnectPair` until the camera is available again.

Expected behavior:
- Status becomes `Camera offline. Waiting to reconnect...`.
- Only one reconnect attempt runs at a time.
- The retry loop stops after `disconnect()`.
- When `reconnectPair` succeeds, `startViewerSessionWithToken` is called again and status returns to `Connecting`.

- [ ] **Step 2: Run the targeted unit test and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
```

Expected: FAIL because the viewer has no auto reconnect loop.

- [ ] **Step 3: Implement minimal auto reconnect behavior**

In `viewer.ts`:
- Add `AUTO_RECONNECT_INTERVAL_MS = 5000`.
- Keep the active paired camera when `?pair=<pairId>` opens a viewer.
- Add a small reconnect loop that calls `reconnectPair(runtimeConfig, pairedCamera)` after offline/end/error states.
- Clear the loop on back button and disconnect button.
- Reuse `startViewerSessionWithToken` for a successful retry.
- Preserve manual reconnect error messages from `describeReconnectError`.

- [ ] **Step 4: Add an e2e test for camera restart**

Extend `e2e/remote-live.spec.ts` with a test:
- Pair camera and viewer.
- Stop the camera.
- Leave viewer on the viewer page.
- Start camera again from the same camera device storage.
- Expect viewer status to return to `Connecting` or live without pressing Reconnect.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
npm run test:e2e -- --grep "auto reconnect"
```

Expected: targeted tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/viewer.ts packages/web/test/viewer-session.test.ts e2e/remote-live.spec.ts
git commit -m "Add viewer auto reconnect"
```

## Task 2: Battery and Charging Status

**Branch:** `feature/battery-status`

**Worktree:** `.worktrees/battery-status`

**Files:**
- Create: `packages/web/src/battery-status.ts`
- Modify: `packages/web/src/home.ts`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/camera.ts`
- Modify: `packages/web/src/viewer.ts`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/battery-status.test.ts`
- Test: `packages/web/test/home.test.ts`

- [ ] **Step 1: Write failing tests for battery formatting**

Create `battery-status.test.ts` covering:
- `charging=true`, `level=0.83` formats as `Charging 83%`.
- `charging=false`, `level=0.18` formats as `Battery low 18%`.
- Missing Battery Status API returns `Battery unavailable`.

- [ ] **Step 2: Run battery unit test and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- battery-status
```

Expected: FAIL because `battery-status.ts` does not exist.

- [ ] **Step 3: Implement the battery helper**

Create `battery-status.ts` with:
- `BatterySnapshot` type.
- `formatBatterySnapshot(snapshot)`.
- `readBatterySnapshot(navigatorLike)` that supports browsers with `navigator.getBattery()` and returns unavailable when unsupported.
- `watchBatterySnapshot(navigatorLike, callback)` that listens for `levelchange` and `chargingchange`, returning a cleanup function.

- [ ] **Step 4: Add compact UI slots**

Add a compact status row:
- On Me: inside the personal settings area near `Your connections`.
- On camera and viewer screens: one `p` or `span` near the status card, not a new large card.

Use text only when data is available or unsupported; avoid changing bottom nav layout.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- battery-status home
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/battery-status.ts packages/web/src/home.ts packages/web/src/main.ts packages/web/src/camera.ts packages/web/src/viewer.ts packages/web/src/styles.css packages/web/test/battery-status.test.ts packages/web/test/home.test.ts
git commit -m "Show battery and charging status"
```

## Task 3: Background and Keep-Awake Guidance

**Branch:** `feature/keep-awake-guidance`

**Worktree:** `.worktrees/keep-awake-guidance`

**Files:**
- Modify: `packages/web/src/safety.ts`
- Modify: `packages/web/src/camera.ts`
- Modify: `packages/web/src/viewer.ts`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/safety.test.ts`
- Test: `packages/web/test/camera.test.ts`

- [ ] **Step 1: Write failing tests for wake lock state**

Add tests for:
- Wake lock request success returns `awake`.
- Wake lock unsupported returns `unsupported`.
- Wake lock failure returns `blocked`.
- Visibility restoration can request wake lock again.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- safety camera
```

Expected: FAIL because current wake lock helper only returns the sentinel.

- [ ] **Step 3: Implement status-aware wake lock helper**

In `safety.ts`, add a wrapper such as `createWakeLockController()` that:
- Requests screen wake lock when available.
- Exposes current state as `awake`, `unsupported`, or `blocked`.
- Re-requests on `visibilitychange` when the document becomes visible.
- Releases on session cleanup.

- [ ] **Step 4: Surface compact guidance**

In camera and viewer screens:
- Show `Screen stays awake` when active.
- Show `Keep this phone open` when unsupported or blocked.
- Do not add a modal or full-screen instructions.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- safety camera
```

Expected: targeted tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/safety.ts packages/web/src/camera.ts packages/web/src/viewer.ts packages/web/src/styles.css packages/web/test/safety.test.ts packages/web/test/camera.test.ts
git commit -m "Add keep-awake session guidance"
```

## Task 4: Multi-Camera List Improvements

**Branch:** `feature/multi-camera-list`

**Worktree:** `.worktrees/multi-camera-list`

**Files:**
- Modify: `packages/web/src/home.ts`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/paired-cameras.ts`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/home.test.ts`
- Test: `packages/web/test/paired-cameras.test.ts`
- Test: `e2e/remote-live.spec.ts`

- [ ] **Step 1: Write failing tests for camera ordering and list controls**

Tests should cover:
- Paired cameras sort by live status first, then newest `lastConnectedAt`.
- A search field filters by display name.
- Empty search result says `No matching cameras`.
- Remove still deletes only the selected camera.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- home paired-cameras
```

Expected: FAIL because sorting and search do not exist.

- [ ] **Step 3: Implement list model helpers**

In `paired-cameras.ts`, add pure helpers:
- `sortPairedCameras(cameras, statuses)`.
- `filterPairedCameras(cameras, query)`.

Keep status lookup tolerant when a status has not loaded yet.

- [ ] **Step 4: Add list UI**

In Cameras tab:
- Add a compact search input above the list.
- Show small status chips for Live, Offline, or Checking.
- Keep action buttons stable and large enough for touch.

- [ ] **Step 5: Add e2e coverage**

Add a Playwright test that pairs at least two cameras with different names, filters one name, and confirms only that card remains.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- home paired-cameras
npm run test:e2e -- --grep "camera list"
```

Expected: targeted tests pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/web/src/home.ts packages/web/src/main.ts packages/web/src/paired-cameras.ts packages/web/src/styles.css packages/web/test/home.test.ts packages/web/test/paired-cameras.test.ts e2e/remote-live.spec.ts
git commit -m "Improve multi-camera list controls"
```

## Task 5: Video Quality Preference

**Branch:** `feature/video-quality-preference`

**Worktree:** `.worktrees/video-quality-preference`

**Files:**
- Create: `packages/web/src/video-quality.ts`
- Modify: `packages/web/src/home.ts`
- Modify: `packages/web/src/main.ts`
- Modify: `packages/web/src/camera.ts`
- Modify: `packages/web/src/webrtc.ts`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/video-quality.test.ts`
- Test: `packages/web/test/camera.test.ts`
- Test: `packages/web/test/webrtc.test.ts`

- [ ] **Step 1: Write failing tests for quality preferences**

Create tests covering:
- Default quality is `Balanced`.
- `Data saver` maps to lower video constraints.
- `Sharp` maps to higher video constraints.
- Saved preference is reused by camera startup.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- video-quality camera webrtc
```

Expected: FAIL because quality settings do not exist.

- [ ] **Step 3: Implement video quality helper**

Create `video-quality.ts` with:
- `VideoQuality = "data-saver" | "balanced" | "sharp"`.
- `readVideoQuality(storage)`.
- `saveVideoQuality(storage, value)`.
- `buildVideoConstraints(value)` returning camera constraints for `getUserMedia`.

- [ ] **Step 4: Wire camera startup**

In `camera.ts`, replace the fixed `{ facingMode: "environment" }` video constraint with `buildVideoConstraints(readVideoQuality(storage))`.

- [ ] **Step 5: Add Me page segmented control**

In Me tab:
- Add a compact segmented control for Data saver, Balanced, Sharp.
- Store changes immediately.
- Keep the nav alignment test passing.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- video-quality camera webrtc home
```

Expected: targeted tests pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/web/src/video-quality.ts packages/web/src/home.ts packages/web/src/main.ts packages/web/src/camera.ts packages/web/src/webrtc.ts packages/web/src/styles.css packages/web/test/video-quality.test.ts packages/web/test/camera.test.ts packages/web/test/webrtc.test.ts
git commit -m "Add video quality preference"
```

## Integration Plan

- [ ] Create five worktrees from current `main`.
- [ ] Dispatch one `gpt-5.5` / `xhigh` worker per priority branch.
- [ ] Require each worker to commit its branch and report changed files, tests run, and any merge risks.
- [ ] Review each branch in priority order:
  1. Spec compliance.
  2. UI/layout risk.
  3. Test quality.
  4. Merge conflicts.
- [ ] Merge Priority 1 first. If later branches conflict heavily, rebase or cherry-pick only the parts that are safe.
- [ ] Run full verification after integration:

```powershell
npm run build
npm run test
npm run test:e2e
```

- [ ] Push `main`.
- [ ] Deploy to `47.86.100.51` after verification.

## Self-Review Notes

- Each priority has a test-first step and explicit RED/GREEN commands.
- The plan intentionally scopes UI additions to compact elements because the current user feedback focused on mobile layout stability.
- The likely merge-conflict files are `home.ts`, `main.ts`, `camera.ts`, `viewer.ts`, `styles.css`, and `e2e/remote-live.spec.ts`; the controller must resolve these after reviewing worker branches.
- Server changes are intentionally avoided unless a worker proves a client feature cannot be done with current pair status and reconnect APIs.
