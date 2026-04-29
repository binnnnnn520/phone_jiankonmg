import type {
  IceServerConfig,
  PairReconnectResponse,
  SignalingMessage,
  UserFacingConnectionState,
  ViewerPairedCamera,
  VerifyPinResponse
} from "@phone-monitor/shared";
import {
  reconnectPair,
  verifyPin as verifyPinRequest
} from "./api.js";
import {
  formatBatterySnapshot,
  watchBatterySnapshot
} from "./battery-status.js";
import {
  browserConnectionModeStorage,
  chooseConnectionMode,
  resolvePreferredConnectionMode
} from "./connection-mode.js";
import { loadClientConfig, type ClientConfig } from "./config.js";
import {
  browserPairStorage,
  getOrCreateDeviceId,
  readPairedCameras,
  upsertPairedCamera
} from "./paired-cameras.js";
import {
  SignalingClient,
  type SignalingClientLike
} from "./signaling-client.js";
import {
  createPeer as createPeerController,
  flushQueuedIceCandidates,
  type CreatePeerParams,
  type PeerController
} from "./webrtc.js";

type VerifyPinFn = (
  config: ClientConfig,
  roomId: string,
  pin: string,
  fetcher?: typeof fetch,
  pairing?: { viewerDeviceId?: string; displayName?: string }
) => Promise<VerifyPinResponse>;

type CreateSignalingClientFn = (wsUrl: string) => SignalingClientLike;
type CreatePeerFn = (params: CreatePeerParams) => PeerController;
type ReconnectPairFn = (
  config: ClientConfig,
  pairedCamera: ViewerPairedCamera
) => Promise<PairReconnectResponse>;
type StartViewerSessionWithTokenFn = (
  params: StartViewerSessionWithTokenParams
) => Promise<ViewerSession>;
type ScheduleReconnectFn = (
  callback: () => void | Promise<void>,
  delayMs: number
) => unknown;
type CancelReconnectFn = (handle: unknown) => void;

export const AUTO_RECONNECT_INTERVAL_MS = 5000;
const AUTO_RECONNECT_WAITING_STATUS = "Camera offline. Waiting to reconnect...";

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructorLike {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

export interface ViewerSession {
  disconnect: () => void;
}

export interface RenderViewerOptions {
  onBack?: () => void;
}

export interface StartViewerSessionParams {
  config: ClientConfig;
  roomId: string;
  pin: string;
  viewerDeviceId?: string;
  video: HTMLVideoElement;
  onState: (state: UserFacingConnectionState) => void;
  onPairedCamera?: (pairedCamera: ViewerPairedCamera) => void;
  deps?: {
    verifyPin?: VerifyPinFn;
    createSignalingClient?: CreateSignalingClientFn;
    createPeer?: CreatePeerFn;
  };
}

export interface StartViewerSessionWithTokenParams {
  config: ClientConfig;
  roomId: string;
  viewerToken: string;
  iceServers: IceServerConfig[];
  video: HTMLVideoElement;
  onState: (state: UserFacingConnectionState) => void;
  deps?: {
    createSignalingClient?: CreateSignalingClientFn;
    createPeer?: CreatePeerFn;
  };
}

export interface ViewerAutoReconnectController {
  setPairedCamera: (pairedCamera: ViewerPairedCamera) => void;
  connectNow: () => Promise<void>;
  disconnect: () => void;
}

export interface CreateViewerAutoReconnectControllerParams {
  config: ClientConfig;
  video: HTMLVideoElement;
  status: Pick<HTMLElement, "textContent">;
  getSession: () => ViewerSession | undefined;
  setSession: (session: ViewerSession | undefined) => void;
  reconnectPair: ReconnectPairFn;
  startViewerSessionWithToken: StartViewerSessionWithTokenFn;
  upsertPairedCamera: (pairedCamera: ViewerPairedCamera) => void;
  reconnectDelayMs?: number;
  scheduleReconnect?: ScheduleReconnectFn;
  cancelReconnect?: CancelReconnectFn;
}

export async function startViewerSession(
  params: StartViewerSessionParams
): Promise<ViewerSession> {
  const verifyPin = params.deps?.verifyPin ?? verifyPinRequest;

  params.onState("Checking PIN");
  const verified = await verifyPin(params.config, params.roomId, params.pin, undefined, {
    ...(params.viewerDeviceId ? { viewerDeviceId: params.viewerDeviceId } : {})
  });
  params.onPairedCamera?.(verified.pairedCamera);

  return startViewerSessionWithToken({
    config: params.config,
    roomId: params.roomId,
    viewerToken: verified.viewerToken,
    iceServers: verified.iceServers,
    video: params.video,
    onState: params.onState,
    deps: {
      ...(params.deps?.createSignalingClient
        ? { createSignalingClient: params.deps.createSignalingClient }
        : {}),
      ...(params.deps?.createPeer ? { createPeer: params.deps.createPeer } : {})
    }
  });
}

export async function startViewerSessionWithToken(
  params: StartViewerSessionWithTokenParams
): Promise<ViewerSession> {
  const createSignalingClient =
    params.deps?.createSignalingClient ?? ((wsUrl) => new SignalingClient(wsUrl));
  const createPeer = params.deps?.createPeer ?? createPeerController;
  const signaling = createSignalingClient(params.config.wsUrl);
  await signaling.connect();

  const controller = createPeer({
    iceServers: params.iceServers,
    signaling,
    roomId: params.roomId,
    onState: params.onState,
    onRemoteStream: (stream) => {
      params.video.srcObject = stream;
      setRemoteVideoActive(params.video, true);
    }
  });

  signaling.onMessage((message) => {
    handleViewerSignal(
      message,
      params.roomId,
      signaling,
      controller,
      params.onState,
      () => {
        params.video.srcObject = null;
        setRemoteVideoActive(params.video, false);
      }
    );
  });

  signaling.send({
    type: "join-viewer",
    roomId: params.roomId,
    viewerToken: params.viewerToken
  });
  params.onState("Connecting");

  return {
    disconnect: () => {
      controller.close();
      signaling.close();
      params.video.srcObject = null;
      setRemoteVideoActive(params.video, false);
      params.onState("Session ended");
    }
  };
}

export function createViewerAutoReconnectController(
  params: CreateViewerAutoReconnectControllerParams
): ViewerAutoReconnectController {
  const reconnectDelayMs =
    params.reconnectDelayMs ?? AUTO_RECONNECT_INTERVAL_MS;
  const scheduleReconnect: ScheduleReconnectFn =
    params.scheduleReconnect ??
    ((callback, delayMs) => setTimeout(() => void callback(), delayMs));
  const cancelReconnect: CancelReconnectFn =
    params.cancelReconnect ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let pairedCamera: ViewerPairedCamera | undefined;
  let reconnectHandle: unknown;
  let reconnecting = false;
  let stopped = false;
  let closingForReconnect = false;

  function clearReconnectTimer(): void {
    if (reconnectHandle === undefined) return;
    cancelReconnect(reconnectHandle);
    reconnectHandle = undefined;
  }

  function scheduleNextReconnect(): void {
    if (stopped || reconnecting || reconnectHandle !== undefined || !pairedCamera) {
      return;
    }

    reconnectHandle = scheduleReconnect(async () => {
      reconnectHandle = undefined;
      await connectNow().catch((error) => {
        if (!stopped) params.status.textContent = describeReconnectError(error);
      });
    }, reconnectDelayMs);
  }

  function showWaitingForReconnect(): void {
    if (stopped) return;
    params.status.textContent = AUTO_RECONNECT_WAITING_STATUS;
    scheduleNextReconnect();
  }

  function handleViewerState(state: UserFacingConnectionState): void {
    if (closingForReconnect && state === "Session ended") return;

    params.status.textContent = state;
    if (stopped) return;

    if (
      state === "Camera offline" ||
      state === "Session ended" ||
      state === "Retry needed"
    ) {
      showWaitingForReconnect();
    }
  }

  function closeCurrentSessionForReconnect(): void {
    const currentSession = params.getSession();
    if (!currentSession) return;

    closingForReconnect = true;
    currentSession.disconnect();
    closingForReconnect = false;
    params.setSession(undefined);
  }

  async function connectNow(): Promise<void> {
    if (!pairedCamera || reconnecting || stopped) return;

    reconnecting = true;
    clearReconnectTimer();
    let shouldKeepWaiting = false;

    try {
      params.status.textContent = "Reconnecting";
      closeCurrentSessionForReconnect();
      const reconnected = await params.reconnectPair(params.config, pairedCamera);
      if (stopped) return;

      pairedCamera = reconnected.pairedCamera;
      params.upsertPairedCamera(reconnected.pairedCamera);

      const nextSession = await params.startViewerSessionWithToken({
        config: params.config,
        roomId: reconnected.roomId,
        viewerToken: reconnected.viewerToken,
        iceServers: reconnected.iceServers,
        video: params.video,
        onState: handleViewerState
      });

      if (stopped) {
        nextSession.disconnect();
        return;
      }

      params.setSession(nextSession);
    } catch (error) {
      if (isPairCameraOfflineError(error)) {
        shouldKeepWaiting = true;
        return;
      }
      throw error;
    } finally {
      reconnecting = false;
      if (shouldKeepWaiting) showWaitingForReconnect();
    }
  }

  return {
    setPairedCamera: (nextPairedCamera) => {
      pairedCamera = nextPairedCamera;
    },
    connectNow,
    disconnect: () => {
      stopped = true;
      clearReconnectTimer();
      const currentSession = params.getSession();
      params.setSession(undefined);
      if (currentSession) {
        currentSession.disconnect();
        return;
      }
      params.status.textContent = "Session ended";
    }
  };
}

function setRemoteVideoActive(video: HTMLVideoElement, active: boolean): void {
  const dataset = (video as HTMLVideoElement & { dataset?: DOMStringMap }).dataset;
  if (!dataset) return;

  if (active) {
    dataset.streamState = "live";
    return;
  }

  delete dataset.streamState;
}

function handleViewerSignal(
  message: SignalingMessage,
  roomId: string,
  signaling: SignalingClientLike,
  controller: PeerController,
  onState: (state: UserFacingConnectionState) => void,
  clearRemoteVideo: () => void
): void {
  if (message.type === "offer") {
    void controller.peer
      .setRemoteDescription(message.sdp)
      .then(async () => {
        await flushQueuedIceCandidates(controller.peer);
        const answer = await controller.peer.createAnswer();
        await controller.peer.setLocalDescription(answer);
        signaling.send({ type: "answer", roomId, sdp: answer });
      })
      .catch(() => {
        onState("Retry needed");
      });
  }
  if (message.type === "peer-left") {
    onState("Camera offline");
  }
  if (message.type === "session-ended") {
    clearRemoteVideo();
    onState("Session ended");
  }
  if (message.type === "error") {
    onState("Retry needed");
  }
}

export function extractRoomFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  try {
    const baseOrigin =
      (globalThis as typeof globalThis & { window?: Window }).window?.location
        .origin ?? "https://local.invalid";
    const url = new URL(trimmed, baseOrigin);
    return url.searchParams.get("room")?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function describeReconnectError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "PAIR_CAMERA_OFFLINE") {
    return "Camera is offline. Start monitoring on the camera phone, then try again.";
  }
  if (message === "PAIR_REJECTED") {
    return "Pair this camera again with QR and PIN.";
  }
  if (message === "VIEWER_ALREADY_CONNECTED") {
    return "Another viewer is already connected to this camera.";
  }
  return message || "Could not reconnect";
}

function isPairCameraOfflineError(error: unknown): boolean {
  return error instanceof Error && error.message === "PAIR_CAMERA_OFFLINE";
}

async function scanQrIntoRoom(params: {
  panel: HTMLElement;
  video: HTMLVideoElement;
  roomInput: HTMLInputElement;
  status: HTMLElement;
  cancelButton: HTMLButtonElement;
}): Promise<void> {
  const detectorConstructor = (globalThis as typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructorLike;
  }).BarcodeDetector;

  if (!detectorConstructor || !navigator.mediaDevices?.getUserMedia) {
    params.status.textContent =
      "QR scanning is not available in this browser. Open the QR link or enter the room manually.";
    return;
  }

  let cancelled = false;
  let stream: MediaStream | undefined;
  params.cancelButton.addEventListener(
    "click",
    () => {
      cancelled = true;
    },
    { once: true }
  );

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    params.video.srcObject = stream;
    params.panel.hidden = false;
    await params.video.play().catch(() => undefined);

    const detector = new detectorConstructor({ formats: ["qr_code"] });
    const expiresAt = Date.now() + 15000;

    while (!cancelled && Date.now() < expiresAt) {
      const codes = await detector.detect(params.video).catch(() => []);
      const room = codes
        .map((code) => code.rawValue)
        .filter((value): value is string => Boolean(value))
        .map(extractRoomFromQrPayload)
        .find(Boolean);

      if (room) {
        params.roomInput.value = room;
        params.status.textContent =
          "QR code scanned. Enter the PIN shown on the camera phone.";
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!cancelled) {
      params.status.textContent =
        "No QR code found. Keep the code inside the camera view or enter the room manually.";
    }
  } catch {
    params.status.textContent =
      "Camera access was not available for QR scanning. Enter the room manually.";
  } finally {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    params.video.srcObject = null;
    params.panel.hidden = true;
  }
}

export function renderViewer(
  app: HTMLElement,
  options: RenderViewerOptions = {}
): void {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get("room") ?? "";
  const reconnectPairId = params.get("pair") ?? "";
  const doc = app.ownerDocument;
  const config = loadClientConfig();
  const pairStorage = browserPairStorage();
  const viewerDeviceId = getOrCreateDeviceId(pairStorage);
  const preferredConnectionMode = resolvePreferredConnectionMode({
    params,
    storage: browserConnectionModeStorage(),
    configuredMode: config.preferredConnectionMode
  });
  const runtimeConfig = { ...config, preferredConnectionMode };
  const connectionMode = chooseConnectionMode(runtimeConfig);

  const section = doc.createElement("section");
  section.className = "app-shell monitor-panel viewer-screen light-monitor-shell";

  const header = doc.createElement("header");
  header.className = "top-bar";
  const back = doc.createElement("button");
  back.className = "icon-button ghost-button";
  back.type = "button";
  back.setAttribute("aria-label", "Back");
  back.setAttribute("data-nav-back", "");
  const titleBlock = doc.createElement("div");
  titleBlock.className = "top-title-block";
  const kicker = doc.createElement("p");
  kicker.className = "screen-kicker";
  kicker.textContent = "Viewer station";
  const heading = doc.createElement("h1");
  heading.className = "top-title";
  heading.textContent = "Phone Monitor";
  titleBlock.append(kicker, heading);
  const mode = doc.createElement("p");
  mode.className = "mode-pill";
  mode.id = "connection-mode";
  mode.textContent = connectionMode.label;
  header.append(back, titleBlock, mode);

  const videoWrap = doc.createElement("div");
  videoWrap.className = "video-frame viewer-video-frame";
  const video = doc.createElement("video");
  video.id = "remote";
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  const liveBadge = doc.createElement("span");
  liveBadge.className = "video-badge";
  liveBadge.textContent = "Live";
  videoWrap.append(video, liveBadge);

  const status = doc.createElement("p");
  status.className = "connected-card";
  status.id = "status";
  status.setAttribute("role", "status");
  status.textContent = "Connect to a camera";

  const batteryStatus = doc.createElement("p");
  batteryStatus.className = "battery-status session-battery-status";
  batteryStatus.id = "battery-status";
  batteryStatus.setAttribute("data-battery-status", "");
  batteryStatus.textContent = "Battery unavailable";

  const scan = doc.createElement("button");
  scan.className = "scan-qr-button";
  scan.id = "scan-qr";
  scan.type = "button";
  scan.textContent = "Scan QR code";

  const scannerPanel = doc.createElement("section");
  scannerPanel.className = "qr-scanner-panel";
  scannerPanel.hidden = true;
  const scannerVideo = doc.createElement("video");
  scannerVideo.id = "qr-scanner-video";
  scannerVideo.autoplay = true;
  scannerVideo.muted = true;
  scannerVideo.playsInline = true;
  const cancelScan = doc.createElement("button");
  cancelScan.className = "ghost-outline";
  cancelScan.id = "cancel-scan";
  cancelScan.type = "button";
  cancelScan.textContent = "Cancel scan";
  scannerPanel.append(scannerVideo, cancelScan);

  const form = doc.createElement("form");
  form.className = "form-grid";
  form.id = "viewer-form";

  const roomLabel = doc.createElement("label");
  roomLabel.className = "field-label";
  const roomInput = doc.createElement("input");
  roomInput.id = "room";
  roomInput.autocomplete = "off";
  roomInput.value = initialRoom;
  roomLabel.append("Room ", roomInput);

  const pinLabel = doc.createElement("label");
  pinLabel.className = "field-label";
  const pinInput = doc.createElement("input");
  pinInput.id = "pin";
  pinInput.autocomplete = "one-time-code";
  pinInput.inputMode = "numeric";
  pinInput.maxLength = 6;
  pinLabel.append("PIN ", pinInput);

  const connect = doc.createElement("button");
  connect.id = "connect";
  connect.type = "submit";
  connect.textContent = "Connect";
  form.append(roomLabel, pinLabel, connect);

  const disconnect = doc.createElement("button");
  disconnect.className = "danger full-action";
  disconnect.id = "disconnect";
  disconnect.type = "button";
  disconnect.textContent = "Disconnect";

  section.append(
    header,
    videoWrap,
    status,
    batteryStatus,
    scan,
    scannerPanel,
    form,
    disconnect
  );
  app.replaceChildren(section);
  let session: ViewerSession | undefined;
  let closed = false;
  let batteryStatusCleanup: (() => void) | undefined;
  const autoReconnect = createViewerAutoReconnectController({
    config: runtimeConfig,
    video,
    status,
    getSession: () => session,
    setSession: (nextSession) => {
      session = nextSession;
    },
    reconnectPair,
    startViewerSessionWithToken,
    upsertPairedCamera: (pairedCamera) => {
      upsertPairedCamera(pairStorage, pairedCamera);
    }
  });

  void watchBatterySnapshot(navigator, (snapshot) => {
    batteryStatus.textContent = formatBatterySnapshot(snapshot);
  }).then((cleanup) => {
    if (closed) {
      cleanup();
      return;
    }
    batteryStatusCleanup = cleanup;
  });

  back.addEventListener("click", () => {
    closed = true;
    batteryStatusCleanup?.();
    batteryStatusCleanup = undefined;
    autoReconnect.disconnect();
    options.onBack?.();
  });

  async function reconnectFromStoredPair(pairId: string): Promise<void> {
    const pairedCamera = readPairedCameras(pairStorage).find(
      (camera) => camera.pairId === pairId
    );
    if (!pairedCamera) {
      status.textContent = "Pair this camera once before reconnecting.";
      return;
    }

    autoReconnect.setPairedCamera(pairedCamera);
    await autoReconnect.connectNow();
  }

  scan.addEventListener("click", () => {
    void scanQrIntoRoom({
      panel: scannerPanel,
      video: scannerVideo,
      roomInput,
      status,
      cancelButton: cancelScan
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const roomId = roomInput.value.trim();
      const pin = pinInput.value.trim();
      if (!roomId || !pin) {
        status.textContent = "Enter both room and PIN.";
        return;
      }

      autoReconnect.disconnect();
      session = await startViewerSession({
        config: runtimeConfig,
        roomId,
        pin,
        viewerDeviceId,
        video,
        onPairedCamera: (pairedCamera) => {
          upsertPairedCamera(pairStorage, pairedCamera);
        },
        onState: (state) => {
          status.textContent = state;
        }
      });
    })().catch((error) => {
      status.textContent = error instanceof Error ? error.message : "Could not connect";
    });
  });

  disconnect.addEventListener("click", () => {
    autoReconnect.disconnect();
  });

  if (reconnectPairId) {
    void reconnectFromStoredPair(reconnectPairId).catch((error) => {
      status.textContent = describeReconnectError(error);
    });
  }
}
