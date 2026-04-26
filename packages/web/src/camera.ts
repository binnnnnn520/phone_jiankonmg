import type { CreateRoomResponse } from "@phone-monitor/shared";
import * as QRCode from "qrcode";
import { createRoom } from "./api.js";
import { loadClientConfig } from "./config.js";
import {
  describeCameraError,
  releaseWakeLock,
  requestWakeLock,
  stopStream,
  type StoppableMediaStream,
  type WakeLockSentinelLike
} from "./safety.js";
import { SignalingClient } from "./signaling-client.js";
import { createPeer, type PeerController } from "./webrtc.js";

export interface BuildViewerUrlOptions {
  origin: string;
  publicViewerUrl?: string;
}

export interface StopCameraSessionParams {
  peerController: Pick<PeerController, "close">;
  signaling?: Pick<SignalingClient, "send" | "close">;
  stream?: StoppableMediaStream;
  wakeLock?: WakeLockSentinelLike;
  roomId: string;
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
  return url.toString();
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

export async function renderCamera(app: HTMLElement): Promise<void> {
  const config = loadClientConfig();
  app.innerHTML = `
    <section class="app-shell monitor-panel">
      <header class="screen-header">
        <p class="eyebrow">Camera</p>
        <h1>Active Monitoring</h1>
      </header>
      <p class="status" id="status" role="status">Starting camera...</p>
      <video id="preview" autoplay muted playsinline></video>
      <div class="pairing-grid">
        <canvas id="qr" aria-label="Viewer QR code"></canvas>
        <div>
          <p class="label">Viewer PIN</p>
          <p class="pin" id="pin">------</p>
          <p class="hint">Keep this phone visible, plugged in, and in the foreground.</p>
        </div>
      </div>
      <button class="danger" id="stop" type="button">Stop monitoring</button>
    </section>
  `;

  const status = app.querySelector<HTMLParagraphElement>("#status")!;
  const preview = app.querySelector<HTMLVideoElement>("#preview")!;
  const qr = app.querySelector<HTMLCanvasElement>("#qr")!;
  const pin = app.querySelector<HTMLParagraphElement>("#pin")!;
  const stop = app.querySelector<HTMLButtonElement>("#stop")!;

  let stream: MediaStream | undefined;
  let signaling: SignalingClient | undefined;
  let wakeLock: WakeLockSentinelLike | undefined;

  try {
    wakeLock = await requestWakeLock();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    preview.srcObject = stream;

    const room: CreateRoomResponse = await createRoom(config);
    const viewerUrl = buildViewerUrl(room.roomId, {
      origin: window.location.origin,
      ...(config.publicViewerUrl
        ? { publicViewerUrl: config.publicViewerUrl }
        : {})
    });
    await QRCode.toCanvas(qr, viewerUrl, { width: 180, margin: 1 });
    pin.textContent = room.pin;
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
      if (message.type === "peer-left") {
        status.textContent = "Waiting for viewer";
      }
      if (message.type === "error") {
        status.textContent = "Retry needed";
      }
    });

    stop.addEventListener("click", () => {
      stop.disabled = true;
      void stopCameraSession({
        peerController,
        roomId: room.roomId,
        ...(signaling ? { signaling } : {}),
        ...(stream ? { stream } : {}),
        ...(wakeLock ? { wakeLock } : {})
      }).finally(() => {
        status.textContent = "Session ended";
      });
    });
  } catch (error) {
    status.textContent = describeCameraError(error);
    if (stream) stopStream(stream);
    signaling?.close();
    await releaseWakeLock(wakeLock);
  }
}
