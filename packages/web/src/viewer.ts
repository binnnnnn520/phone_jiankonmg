import type {
  SignalingMessage,
  UserFacingConnectionState,
  VerifyPinResponse
} from "@phone-monitor/shared";
import { verifyPin as verifyPinRequest } from "./api.js";
import { loadClientConfig, type ClientConfig } from "./config.js";
import {
  SignalingClient,
  type SignalingClientLike
} from "./signaling-client.js";
import {
  createPeer as createPeerController,
  type CreatePeerParams,
  type PeerController
} from "./webrtc.js";

type VerifyPinFn = (
  config: ClientConfig,
  roomId: string,
  pin: string
) => Promise<VerifyPinResponse>;

type CreateSignalingClientFn = (wsUrl: string) => SignalingClientLike;
type CreatePeerFn = (params: CreatePeerParams) => PeerController;

export interface ViewerSession {
  disconnect: () => void;
}

export interface StartViewerSessionParams {
  config: ClientConfig;
  roomId: string;
  pin: string;
  video: HTMLVideoElement;
  onState: (state: UserFacingConnectionState) => void;
  deps?: {
    verifyPin?: VerifyPinFn;
    createSignalingClient?: CreateSignalingClientFn;
    createPeer?: CreatePeerFn;
  };
}

export async function startViewerSession(
  params: StartViewerSessionParams
): Promise<ViewerSession> {
  const verifyPin = params.deps?.verifyPin ?? verifyPinRequest;
  const createSignalingClient =
    params.deps?.createSignalingClient ?? ((wsUrl) => new SignalingClient(wsUrl));
  const createPeer = params.deps?.createPeer ?? createPeerController;

  params.onState("Checking PIN");
  const verified = await verifyPin(params.config, params.roomId, params.pin);
  const signaling = createSignalingClient(params.config.wsUrl);
  await signaling.connect();

  const controller = createPeer({
    iceServers: verified.iceServers,
    signaling,
    roomId: params.roomId,
    onState: params.onState,
    onRemoteStream: (stream) => {
      params.video.srcObject = stream;
    }
  });

  signaling.onMessage((message) => {
    handleViewerSignal(message, params.roomId, signaling, controller, params.onState);
  });

  signaling.send({
    type: "join-viewer",
    roomId: params.roomId,
    viewerToken: verified.viewerToken
  });
  params.onState("Connecting");

  return {
    disconnect: () => {
      controller.close();
      signaling.close();
      params.onState("Session ended");
    }
  };
}

function handleViewerSignal(
  message: SignalingMessage,
  roomId: string,
  signaling: SignalingClientLike,
  controller: PeerController,
  onState: (state: UserFacingConnectionState) => void
): void {
  if (message.type === "offer") {
    void controller.peer.setRemoteDescription(message.sdp).then(async () => {
      const answer = await controller.peer.createAnswer();
      await controller.peer.setLocalDescription(answer);
      signaling.send({ type: "answer", roomId, sdp: answer });
    });
  }
  if (message.type === "peer-left" || message.type === "session-ended") {
    onState("Camera offline");
  }
  if (message.type === "error") {
    onState("Retry needed");
  }
}

export function renderViewer(app: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get("room") ?? "";
  app.innerHTML = `
    <section class="app-shell monitor-panel">
      <header class="screen-header">
        <p class="eyebrow">Viewer</p>
        <h1>Live Monitor</h1>
      </header>
      <p class="status" id="status" role="status">Enter the room and PIN from the camera phone.</p>
      <form class="form-grid" id="viewer-form">
        <label>Room <input id="room" autocomplete="off" value="${initialRoom}" /></label>
        <label>PIN <input id="pin" autocomplete="one-time-code" inputmode="numeric" maxlength="6" /></label>
        <button id="connect" type="submit">Connect</button>
      </form>
      <video id="remote" autoplay playsinline controls></video>
      <button class="danger" id="disconnect" type="button">Disconnect</button>
    </section>
  `;

  const config = loadClientConfig();
  const roomInput = app.querySelector<HTMLInputElement>("#room")!;
  const pinInput = app.querySelector<HTMLInputElement>("#pin")!;
  const status = app.querySelector<HTMLParagraphElement>("#status")!;
  const video = app.querySelector<HTMLVideoElement>("#remote")!;
  const form = app.querySelector<HTMLFormElement>("#viewer-form")!;
  const disconnect = app.querySelector<HTMLButtonElement>("#disconnect")!;
  let session: ViewerSession | undefined;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const roomId = roomInput.value.trim();
      const pin = pinInput.value.trim();
      if (!roomId || !pin) {
        status.textContent = "Enter both room and PIN.";
        return;
      }

      session?.disconnect();
      session = await startViewerSession({
        config,
        roomId,
        pin,
        video,
        onState: (state) => {
          status.textContent = state;
        }
      });
    })().catch((error) => {
      status.textContent = error instanceof Error ? error.message : "Could not connect";
    });
  });

  disconnect.addEventListener("click", () => {
    session?.disconnect();
    session = undefined;
  });
}
