import type {
  CreateRoomRequest,
  CreateRoomResponse,
  SignalingMessage
} from "@phone-monitor/shared";
import * as QRCode from "qrcode";
import type { ConnectionMode } from "@phone-monitor/shared";
import { createRoom } from "./api.js";
import {
  formatBatterySnapshot,
  watchBatterySnapshot
} from "./battery-status.js";
import {
  browserConnectionModeStorage,
  chooseConnectionMode,
  resolvePreferredConnectionMode
} from "./connection-mode.js";
import { loadClientConfig } from "./config.js";
import {
  browserPairStorage,
  getOrCreateDeviceId,
  readCameraDisplayName,
  readCameraPairing,
  saveCameraPairing,
  type StoredCameraPairing
} from "./paired-cameras.js";
import {
  createWakeLockController,
  describeCameraError,
  formatWakeLockGuidance,
  releaseWakeLock,
  stopStream,
  type StoppableMediaStream,
  type WakeLockController,
  type WakeLockSentinelLike
} from "./safety.js";
import { SignalingClient } from "./signaling-client.js";
import { createPeer, type PeerController } from "./webrtc.js";

export interface BuildViewerUrlOptions {
  origin: string;
  publicViewerUrl?: string;
  connectionMode?: ConnectionMode;
}

export interface StopCameraSessionParams {
  peerController: Pick<PeerController, "close">;
  signaling?: Pick<SignalingClient, "send" | "close">;
  stream?: StoppableMediaStream;
  wakeLock?: WakeLockSentinelLike;
  roomId: string;
}

export interface RenderCameraOptions {
  onBack?: () => void;
}

export function buildViewerUrl(
  roomId: string,
  options: BuildViewerUrlOptions
): string {
  const publicViewerUrl = options.publicViewerUrl?.trim();
  const url = publicViewerUrl
    ? new URL(publicViewerUrl)
    : new URL("/", options.origin);
  url.searchParams.set("room", roomId);
  if (options.connectionMode) {
    url.searchParams.set("connection", options.connectionMode);
  }
  return url.toString();
}

export function buildCameraJoinMessage(
  room: Pick<CreateRoomResponse, "roomId" | "cameraToken">
): SignalingMessage {
  return {
    type: "join-camera",
    roomId: room.roomId,
    cameraToken: room.cameraToken
  };
}

export function buildCreateRoomRequest(
  deviceId: string,
  pairing?: StoredCameraPairing,
  displayName?: string
): CreateRoomRequest {
  const cameraName = displayName?.trim();
  if (pairing) {
    return {
      cameraDeviceId: pairing.cameraDeviceId,
      displayName: cameraName || pairing.displayName,
      pairId: pairing.pairId,
      cameraPairToken: pairing.cameraPairToken
    };
  }

  return {
    cameraDeviceId: deviceId,
    displayName: cameraName || "This phone camera"
  };
}

export function buildCameraShellMarkup(connectionLabel: string): string {
  return `
    <section class="app-shell monitor-panel camera-screen light-monitor-shell">
      <header class="top-bar">
        <button class="icon-button ghost-button" type="button" aria-label="Back" data-nav-back></button>
        <div class="top-title-block">
          <p class="screen-kicker">Camera station</p>
          <h1 class="top-title">Phone Monitor</h1>
        </div>
        <p class="live-indicator"><span aria-hidden="true"></span>Live</p>
      </header>

      <div class="video-frame camera-preview-frame">
        <video id="preview" autoplay muted playsinline></video>
        <span class="video-badge"><span aria-hidden="true"></span>Live</span>
      </div>

      <div class="pairing-command-center">
        <p class="pairing-instruction">Scan the QR code or enter the PIN on the other phone.</p>
        <div class="pairing-card">
          <div class="qr-panel">
            <p class="label">QR</p>
            <canvas id="qr" aria-label="Viewer QR code"></canvas>
          </div>
          <div class="pin-panel">
            <p class="label">PIN</p>
            <p class="pin" id="pin">------</p>
          </div>
        </div>
      </div>

      <p class="ready-card" id="status" role="status">Starting camera...</p>
      <p class="battery-status session-battery-status" id="battery-status" data-battery-status>Battery unavailable</p>
      <p class="wake-lock-guidance" id="wake-lock-guidance">Keep this phone open</p>
      <p class="mode-pill" id="connection-mode">${connectionLabel}</p>
      <button class="danger full-action" id="stop" type="button">Stop</button>
    </section>
  `;
}

export interface HandleCameraStartupFailureParams {
  error: unknown;
  status: Pick<HTMLElement, "textContent">;
  stream?: StoppableMediaStream;
  signaling?: Pick<SignalingClient, "close">;
  wakeLock?: WakeLockSentinelLike;
  isSecureContext: boolean;
  stopButton?: Pick<HTMLButtonElement, "disabled" | "addEventListener">;
}

export async function handleCameraStartupFailure(
  params: HandleCameraStartupFailureParams
): Promise<void> {
  const cameraStarted = Boolean(params.stream);
  params.status.textContent = describeCameraError(
    params.error,
    params.isSecureContext,
    cameraStarted
  );
  params.signaling?.close();

  if (!params.stream) {
    await releaseWakeLock(params.wakeLock);
    return;
  }

  if (params.stopButton) {
    params.stopButton.disabled = false;
    params.stopButton.addEventListener(
      "click",
      async () => {
        stopStream(params.stream!);
        await releaseWakeLock(params.wakeLock);
        params.status.textContent = "Session ended";
      },
      { once: true }
    );
  }
}

export async function stopCameraSession(
  params: StopCameraSessionParams
): Promise<void> {
  params.peerController.close();
  params.signaling?.send({
    type: "session-ended",
    roomId: params.roomId,
    reason: "Camera stopped monitoring"
  });
  params.signaling?.close();
  if (params.stream) stopStream(params.stream);
  await releaseWakeLock(params.wakeLock);
}

export async function renderCamera(
  app: HTMLElement,
  options: RenderCameraOptions = {}
): Promise<void> {
  const config = loadClientConfig();
  const pairStorage = browserPairStorage();
  const deviceId = getOrCreateDeviceId(pairStorage);
  const cameraPairing = readCameraPairing(pairStorage);
  const cameraDisplayName = readCameraDisplayName(pairStorage);
  const preferredConnectionMode = resolvePreferredConnectionMode({
    params: new URLSearchParams(window.location.search),
    storage: browserConnectionModeStorage(),
    configuredMode: config.preferredConnectionMode
  });
  const runtimeConfig = { ...config, preferredConnectionMode };
  const connectionMode = chooseConnectionMode(runtimeConfig);
  app.innerHTML = buildCameraShellMarkup(connectionMode.label);

  const status = app.querySelector<HTMLParagraphElement>("#status")!;
  const preview = app.querySelector<HTMLVideoElement>("#preview")!;
  const qr = app.querySelector<HTMLCanvasElement>("#qr")!;
  const pin = app.querySelector<HTMLParagraphElement>("#pin")!;
  const stop = app.querySelector<HTMLButtonElement>("#stop")!;
  const back = app.querySelector<HTMLButtonElement>("[data-nav-back]")!;
  const batteryStatus = app.querySelector<HTMLParagraphElement>("[data-battery-status]")!;
  const wakeLockGuidance =
    app.querySelector<HTMLParagraphElement>("#wake-lock-guidance")!;

  let stream: MediaStream | undefined;
  let signaling: SignalingClient | undefined;
  let wakeLock: WakeLockController | undefined;
  let peerController: PeerController | undefined;
  let batteryStatusCleanup: (() => void) | undefined;
  let roomId = "";
  let closed = false;

  wakeLock = createWakeLockController({
    onState: (state) => {
      wakeLockGuidance.textContent = formatWakeLockGuidance(state);
    }
  });
  wakeLockGuidance.textContent = formatWakeLockGuidance(wakeLock.state);

  void watchBatterySnapshot(navigator, (snapshot) => {
    batteryStatus.textContent = formatBatterySnapshot(snapshot);
  }).then((cleanup) => {
    if (closed) {
      cleanup();
      return;
    }
    batteryStatusCleanup = cleanup;
  });

  async function cleanupCameraSession(): Promise<void> {
    const currentPeerController = peerController;
    const currentRoomId = roomId;
    const currentSignaling = signaling;
    const currentStream = stream;
    const currentWakeLock = wakeLock;
    const currentBatteryStatusCleanup = batteryStatusCleanup;

    peerController = undefined;
    roomId = "";
    signaling = undefined;
    stream = undefined;
    wakeLock = undefined;
    batteryStatusCleanup = undefined;
    currentBatteryStatusCleanup?.();

    if (currentPeerController && currentRoomId) {
      await stopCameraSession({
        peerController: currentPeerController,
        roomId: currentRoomId,
        ...(currentSignaling ? { signaling: currentSignaling } : {}),
        ...(currentStream ? { stream: currentStream } : {}),
        ...(currentWakeLock ? { wakeLock: currentWakeLock } : {})
      });
      return;
    }

    currentSignaling?.close();
    if (currentStream) stopStream(currentStream);
    await releaseWakeLock(currentWakeLock);
  }

  async function closeCameraSession(): Promise<void> {
    if (closed) return;
    closed = true;
    await cleanupCameraSession();
  }

  async function stopIfClosed(): Promise<boolean> {
    if (!closed) return false;
    await cleanupCameraSession();
    return true;
  }

  back.addEventListener("click", () => {
    void closeCameraSession().finally(() => {
      options.onBack?.();
    });
  });

  try {
    await wakeLock.request();
    if (await stopIfClosed()) return;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    if (await stopIfClosed()) return;
    preview.srcObject = stream;

    const room: CreateRoomResponse = await createRoom(
      runtimeConfig,
      fetch,
      buildCreateRoomRequest(deviceId, cameraPairing, cameraDisplayName)
    );
    if (await stopIfClosed()) return;
    saveCameraPairing(pairStorage, room.cameraPairing);
    const viewerUrl = buildViewerUrl(room.roomId, {
      origin: window.location.origin,
      connectionMode: connectionMode.mode,
      ...(config.publicViewerUrl
        ? { publicViewerUrl: config.publicViewerUrl }
        : {})
    });
    await QRCode.toCanvas(qr, viewerUrl, { width: 180, margin: 1 });
    if (await stopIfClosed()) return;
    pin.textContent = room.pin;
    status.textContent = "Camera is visible and waiting for a viewer.";

    signaling = new SignalingClient(runtimeConfig.wsUrl);
    await signaling.connect();
    if (await stopIfClosed()) return;
    signaling.send(buildCameraJoinMessage(room));

    roomId = room.roomId;
    const activePeerController = createPeer({
      iceServers: room.iceServers,
      signaling,
      roomId: room.roomId,
      onState: (state) => {
        status.textContent = state;
      }
    });
    peerController = activePeerController;

    if (await stopIfClosed()) return;

    for (const track of stream.getTracks()) {
      activePeerController.peer.addTrack(track, stream);
    }

    signaling.onMessage((message) => {
      if (message.type === "join-viewer") {
        void activePeerController.peer.createOffer().then(async (offer) => {
          await activePeerController.peer.setLocalDescription(offer);
          signaling?.send({ type: "offer", roomId: room.roomId, sdp: offer });
        });
      }
      if (message.type === "peer-left") {
        status.textContent = "Waiting for viewer";
      }
      if (message.type === "error") {
        status.textContent = "Retry needed";
      }
    });

    stop.addEventListener("click", () => {
      stop.disabled = true;
      void closeCameraSession().finally(() => {
        status.textContent = "Session ended";
      });
    });
  } catch (error) {
    if (closed) return;
    await handleCameraStartupFailure({
      error,
      status,
      ...(stream ? { stream } : {}),
      ...(signaling ? { signaling } : {}),
      ...(wakeLock ? { wakeLock } : {}),
      isSecureContext: globalThis.isSecureContext,
      stopButton: stop
    });
  }
}
