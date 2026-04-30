# Realtime Environment Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live-only environment audio to camera sessions so the viewer can hear the monitoring phone's surrounding sound without saving audio.

**Architecture:** Keep audio on the existing WebRTC media connection. The camera captures video plus microphone audio by default, falls back to video-only when microphone access fails, and exposes explicit audio status text. The viewer attaches the existing remote stream to the video element, adds a local mute/unmute control, and reports when the remote stream has no audio track.

**Tech Stack:** TypeScript, Vite, Node test runner, WebRTC `MediaStream`/`RTCPeerConnection`, existing PWA camera/viewer screens.

---

## File Structure

- Modify `packages/web/src/camera.ts`
  - Change camera media constraints from `audio: false` to `audio: true`.
  - Add a helper that retries video-only capture when microphone capture fails.
  - Add camera-side environment audio status markup and status formatting.
  - Keep `stopCameraSession` using `stopStream`, which already stops every media track.
- Modify `packages/web/src/viewer.ts`
  - Add remote audio state helpers.
  - Add a mute/unmute button and environment audio status element near the live video.
  - Update remote-stream handling to detect audio tracks and set playback state.
- Modify `packages/web/src/styles.css`
  - Add compact styles for audio status and viewer audio control.
  - Keep existing bottom navigation, video frame, and status card geometry stable.
- Modify `packages/web/test/camera.test.ts`
  - Cover default audio constraints, fallback capture, audio status markup, and all-track shutdown.
- Modify `packages/web/test/viewer-session.test.ts`
  - Cover remote audio detection, mute/unmute text, no-audio status, and disconnect cleanup.

No server or shared signaling contract changes are needed.

---

### Task 1: Camera Media Constraints and Audio Status

**Files:**
- Modify: `packages/web/src/camera.ts`
- Test: `packages/web/test/camera.test.ts`

- [ ] **Step 1: Write failing tests for default audio capture and camera audio status markup**

Add these imports and type extensions in `packages/web/test/camera.test.ts`:

```ts
type CameraModule = typeof import("../src/camera.js") & {
  buildCameraAudioStatusText?: (audioEnabled: boolean) => string;
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
```

Replace the existing `buildCameraMediaConstraints reuses saved video quality` assertion so it expects `audio: true`:

```ts
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
```

Add these tests near the camera shell markup tests:

```ts
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
```

- [ ] **Step 2: Run the camera tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- camera
```

Expected: FAIL. The current `buildCameraMediaConstraints` returns `audio: false`, `buildCameraAudioStatusText` is not exported, and the markup has no `audio-status` element.

- [ ] **Step 3: Implement media constraints and camera audio status**

In `packages/web/src/camera.ts`, add this exported helper above `buildCameraMediaConstraints`:

```ts
export function buildCameraAudioStatusText(audioEnabled: boolean): string {
  return audioEnabled
    ? "Video and environment audio are live"
    : "Environment audio is off";
}
```

Change `buildCameraMediaConstraints` to request audio:

```ts
export function buildCameraMediaConstraints(
  storage: VideoQualityReader | undefined
): MediaStreamConstraints {
  return {
    video: buildVideoConstraints(readVideoQuality(storage)),
    audio: true
  };
}
```

In `buildCameraShellMarkup`, insert this line after the `status` paragraph and before the battery paragraph:

```html
      <p class="audio-status audio-status-off" id="audio-status">Environment audio is off</p>
```

- [ ] **Step 4: Run camera tests and verify GREEN for Task 1**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- camera
```

Expected: PASS for the updated media constraint and markup tests. Later tasks may add new failing tests before their implementation.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add packages/web/src/camera.ts packages/web/test/camera.test.ts
git commit -m "Request environment audio in camera sessions"
```

---

### Task 2: Camera Microphone Fallback

**Files:**
- Modify: `packages/web/src/camera.ts`
- Test: `packages/web/test/camera.test.ts`

- [ ] **Step 1: Write failing tests for video-only fallback**

Add these types near the other camera test helpers in `packages/web/test/camera.test.ts`:

```ts
type TestMediaDevices = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};
```

Extend `CameraModule` with:

```ts
  requestCameraMonitoringStream?: (
    mediaDevices: TestMediaDevices,
    storage: { getItem: (key: string) => string | null }
  ) => Promise<{ stream: MediaStream; audioEnabled: boolean }>;
```

Add these tests after the media constraints test:

```ts
test("requestCameraMonitoringStream returns audio-enabled stream when combined capture works", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.requestCameraMonitoringStream, "function");

  const stream = { id: "stream-with-audio" } as unknown as MediaStream;
  const calls: MediaStreamConstraints[] = [];

  const result = await camera.requestCameraMonitoringStream!(
    {
      getUserMedia: async (constraints) => {
        calls.push(constraints);
        return stream;
      }
    },
    {
      getItem: (key) =>
        key === VIDEO_QUALITY_STORAGE_KEY ? "balanced" : null
    }
  );

  assert.equal(result.stream, stream);
  assert.equal(result.audioEnabled, true);
  assert.deepEqual(calls, [
    {
      video: buildVideoConstraints("balanced"),
      audio: true
    }
  ]);
});

test("requestCameraMonitoringStream falls back to video-only when microphone capture fails", async () => {
  const camera = await cameraModule();
  assert.equal(typeof camera.requestCameraMonitoringStream, "function");

  const videoOnlyStream = { id: "video-only" } as unknown as MediaStream;
  const calls: MediaStreamConstraints[] = [];

  const result = await camera.requestCameraMonitoringStream!(
    {
      getUserMedia: async (constraints) => {
        calls.push(constraints);
        if (constraints.audio === true) {
          throw new DOMException("Microphone blocked", "NotAllowedError");
        }
        return videoOnlyStream;
      }
    },
    {
      getItem: (key) =>
        key === VIDEO_QUALITY_STORAGE_KEY ? "sharp" : null
    }
  );

  assert.equal(result.stream, videoOnlyStream);
  assert.equal(result.audioEnabled, false);
  assert.deepEqual(calls, [
    {
      video: buildVideoConstraints("sharp"),
      audio: true
    },
    {
      video: buildVideoConstraints("sharp"),
      audio: false
    }
  ]);
});
```

- [ ] **Step 2: Run the camera tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- camera
```

Expected: FAIL because `requestCameraMonitoringStream` is not exported.

- [ ] **Step 3: Implement the capture fallback helper**

In `packages/web/src/camera.ts`, add this interface near `RenderCameraOptions`:

```ts
export interface CameraMonitoringStream {
  stream: MediaStream;
  audioEnabled: boolean;
}
```

Add this helper after `buildCameraMediaConstraints`:

```ts
export async function requestCameraMonitoringStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia">,
  storage: VideoQualityReader | undefined
): Promise<CameraMonitoringStream> {
  const constraints = buildCameraMediaConstraints(storage);

  try {
    return {
      stream: await mediaDevices.getUserMedia(constraints),
      audioEnabled: true
    };
  } catch (error) {
    if (constraints.audio !== true) throw error;

    return {
      stream: await mediaDevices.getUserMedia({
        ...constraints,
        audio: false
      }),
      audioEnabled: false
    };
  }
}
```

In `renderCamera`, query the new audio status element:

```ts
  const audioStatus = app.querySelector<HTMLParagraphElement>("#audio-status")!;
```

Replace the direct `getUserMedia` call:

```ts
    stream = await navigator.mediaDevices.getUserMedia(
      buildCameraMediaConstraints(videoQualityStorage)
    );
```

with:

```ts
    const monitoringStream = await requestCameraMonitoringStream(
      navigator.mediaDevices,
      videoQualityStorage
    );
    stream = monitoringStream.stream;
    audioStatus.textContent = buildCameraAudioStatusText(
      monitoringStream.audioEnabled
    );
    audioStatus.classList.toggle("audio-status-live", monitoringStream.audioEnabled);
    audioStatus.classList.toggle("audio-status-off", !monitoringStream.audioEnabled);
```

- [ ] **Step 4: Run the camera tests and verify GREEN for Task 2**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- camera
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add packages/web/src/camera.ts packages/web/test/camera.test.ts
git commit -m "Fall back when microphone capture is unavailable"
```

---

### Task 3: Viewer Audio State and Mute Control

**Files:**
- Modify: `packages/web/src/viewer.ts`
- Test: `packages/web/test/viewer-session.test.ts`

- [ ] **Step 1: Write failing tests for remote audio state helpers**

In `packages/web/test/viewer-session.test.ts`, update the import:

```ts
import {
  buildViewerAudioStatusText,
  extractRoomFromQrPayload,
  hasAudioTrack,
  renderViewer,
  startViewerSession,
  startViewerSessionWithToken,
  toggleViewerAudio
} from "../src/viewer.js";
```

Add these tests near the existing viewer session tests:

```ts
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
```

- [ ] **Step 2: Run the viewer session tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
```

Expected: FAIL because the exported audio helpers do not exist.

- [ ] **Step 3: Implement viewer audio helpers**

In `packages/web/src/viewer.ts`, add these exported helpers after `createViewerAutoReconnectController`:

```ts
export function hasAudioTrack(stream: MediaStream): boolean {
  return stream.getAudioTracks().length > 0;
}

export function buildViewerAudioStatusText(audioAvailable: boolean): string {
  return audioAvailable
    ? "Environment audio is live"
    : "Environment audio unavailable";
}

export function syncViewerAudioButton(
  video: Pick<HTMLVideoElement, "muted">,
  button: Pick<HTMLButtonElement, "textContent">
): void {
  button.textContent = video.muted ? "Unmute audio" : "Mute audio";
}

export function toggleViewerAudio(
  video: Pick<HTMLVideoElement, "muted">,
  button: Pick<HTMLButtonElement, "textContent">
): void {
  video.muted = !video.muted;
  syncViewerAudioButton(video, button);
}
```

- [ ] **Step 4: Run viewer session tests and verify GREEN for Task 3 helpers**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
```

Expected: PASS for the helper tests. Later viewer DOM integration tests will fail before Task 4 implementation.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add packages/web/src/viewer.ts packages/web/test/viewer-session.test.ts
git commit -m "Add viewer audio playback helpers"
```

---

### Task 4: Viewer Audio UI Integration

**Files:**
- Modify: `packages/web/src/viewer.ts`
- Test: `packages/web/test/viewer-session.test.ts`

- [ ] **Step 1: Write failing tests for viewer audio UI**

In `packages/web/test/viewer-session.test.ts`, update `TestElement` with a `muted` property:

```ts
  muted = false;
```

Add these tests near the render tests:

```ts
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
```

Add this session test near `startViewerSession marks remote video active only while connected`:

```ts
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
```

Extend `StartViewerSessionWithTokenParams` test type if the test file defines one locally:

```ts
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
```

- [ ] **Step 2: Run the viewer session tests and verify RED**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
```

Expected: FAIL because `renderViewer` does not create `#audio-status` or `#toggle-audio`, and `startViewerSessionWithToken` does not accept audio UI parameters.

- [ ] **Step 3: Add audio UI parameters to viewer session startup**

In `packages/web/src/viewer.ts`, extend `StartViewerSessionParams`:

```ts
  audioStatus?: Pick<HTMLElement, "textContent">;
  toggleAudio?: Pick<HTMLButtonElement, "textContent">;
```

Extend `StartViewerSessionWithTokenParams` the same way:

```ts
  audioStatus?: Pick<HTMLElement, "textContent">;
  toggleAudio?: Pick<HTMLButtonElement, "textContent">;
```

In `startViewerSession`, pass these through to `startViewerSessionWithToken`:

```ts
    ...(params.audioStatus ? { audioStatus: params.audioStatus } : {}),
    ...(params.toggleAudio ? { toggleAudio: params.toggleAudio } : {}),
```

In `startViewerSessionWithToken`, update `onRemoteStream`:

```ts
    onRemoteStream: (stream) => {
      params.video.srcObject = stream;
      setRemoteVideoActive(params.video, true);
      params.audioStatus &&
        (params.audioStatus.textContent = buildViewerAudioStatusText(
          hasAudioTrack(stream)
        ));
      params.toggleAudio && syncViewerAudioButton(params.video, params.toggleAudio);
    }
```

In the returned `disconnect`, clear audio status and reset the button:

```ts
      params.audioStatus &&
        (params.audioStatus.textContent = buildViewerAudioStatusText(false));
      params.toggleAudio && syncViewerAudioButton(params.video, params.toggleAudio);
```

- [ ] **Step 4: Add rendered viewer audio controls**

In `renderViewer`, after the `status` element is created, create these elements:

```ts
  const audioRow = doc.createElement("div");
  audioRow.className = "viewer-audio-row";

  const audioStatus = doc.createElement("p");
  audioStatus.className = "audio-status audio-status-off";
  audioStatus.id = "audio-status";
  audioStatus.textContent = buildViewerAudioStatusText(false);

  const toggleAudio = doc.createElement("button");
  toggleAudio.className = "ghost-outline audio-toggle";
  toggleAudio.id = "toggle-audio";
  toggleAudio.type = "button";
  video.muted = true;
  syncViewerAudioButton(video, toggleAudio);

  audioRow.append(audioStatus, toggleAudio);
```

Add `audioRow` to the `section.append(...)` immediately after `status`:

```ts
    status,
    audioRow,
    batteryStatus,
```

Add a click handler after the back handler:

```ts
  toggleAudio.addEventListener("click", () => {
    toggleViewerAudio(video, toggleAudio);
  });
```

Pass audio UI to both session start calls.

In `createViewerAutoReconnectController`, add these optional params:

```ts
  audioStatus?: Pick<HTMLElement, "textContent">;
  toggleAudio?: Pick<HTMLButtonElement, "textContent">;
```

Include them in the `startViewerSessionWithToken` call inside `connectNow`:

```ts
        ...(params.audioStatus ? { audioStatus: params.audioStatus } : {}),
        ...(params.toggleAudio ? { toggleAudio: params.toggleAudio } : {}),
```

When constructing `autoReconnect` in `renderViewer`, pass:

```ts
    audioStatus,
    toggleAudio,
```

When calling `startViewerSession` from the PIN form, pass:

```ts
        audioStatus,
        toggleAudio,
```

- [ ] **Step 5: Run viewer session tests and verify GREEN for Task 4**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- viewer-session
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add packages/web/src/viewer.ts packages/web/test/viewer-session.test.ts
git commit -m "Add viewer environment audio controls"
```

---

### Task 5: Styling and Full Verification

**Files:**
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/camera.test.ts`
- Test: `packages/web/test/viewer-session.test.ts`

- [ ] **Step 1: Add focused styles for audio status and viewer audio row**

Append these styles near the existing `.wake-lock-guidance` block in `packages/web/src/styles.css`:

```css
.audio-status {
  justify-self: center;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  margin: -4px 0 0;
  padding: 0 12px;
  border: 1px solid #b7e4da;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal-ink);
  font-size: 0.84rem;
  font-weight: 850;
  line-height: 1.2;
}

.audio-status-off {
  border-color: #ffd6ca;
  background: var(--coral-soft);
  color: #a73828;
}

.audio-status-live {
  border-color: #b7e4da;
  background: var(--teal-soft);
  color: var(--teal-ink);
}

.viewer-audio-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.viewer-audio-row .audio-status {
  justify-self: start;
  margin: 0;
}

.audio-toggle {
  min-height: 38px;
  padding: 0 12px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Add assertions that stopCameraSession stops audio and video tracks**

Replace the existing `stopCameraSession releases wake lock after ending the room` stream in `packages/web/test/camera.test.ts`:

```ts
    stream: {
      getTracks: () => [{ stop: () => events.push("stop-track") }]
    },
```

with:

```ts
    stream: {
      getTracks: () => [
        { stop: () => events.push("stop-video-track") },
        { stop: () => events.push("stop-audio-track") }
      ]
    },
```

Update the expected event list:

```ts
  assert.deepEqual(events, [
    "close-peer",
    "send:session-ended",
    "close-signaling",
    "stop-video-track",
    "stop-audio-track",
    "release-wake-lock"
  ]);
```

- [ ] **Step 3: Run targeted verification**

Run:

```powershell
npm run test --workspace @phone-monitor/web -- camera viewer-session
```

Expected: PASS for camera and viewer-session tests.

- [ ] **Step 4: Run full workspace verification**

Run:

```powershell
npm run test --workspace @phone-monitor/web
npm run build --workspace @phone-monitor/web
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add packages/web/src/styles.css packages/web/test/camera.test.ts packages/web/test/viewer-session.test.ts
git commit -m "Style realtime environment audio status"
```

---

## Manual Validation

Run these checks on real phones or browser devices after automated verification:

- Start the camera station and confirm the browser requests microphone permission along with camera permission.
- Allow microphone permission and confirm the camera UI says `Video and environment audio are live`.
- Join from the viewer and confirm audio is audible after tapping `Unmute audio` if the browser starts muted.
- Deny microphone permission and confirm video-only monitoring still starts and the camera UI says `Environment audio is off`.
- Stop monitoring and confirm the camera phone's microphone indicator disappears.

---

## Self-Review Notes

- Spec coverage: live-only environment audio is covered by Tasks 1-4; no saved audio or signaling changes are introduced; microphone fallback is covered by Task 2; stop cleanup is covered by Task 5.
- Type consistency: `audioStatus`, `toggleAudio`, `hasAudioTrack`, `buildViewerAudioStatusText`, `syncViewerAudioButton`, and `toggleViewerAudio` are introduced before being used by integration steps.
- Scope check: this is one subsystem, WebRTC live audio, with no server changes and no recording features.
