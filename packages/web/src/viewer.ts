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
  flushQueuedIceCandidates,
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
    handleViewerSignal(
      message,
      params.roomId,
      signaling,
      controller,
      params.onState,
      () => {
        params.video.srcObject = null;
      }
    );
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

export function renderViewer(app: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get("room") ?? "";
  const doc = app.ownerDocument;

  const section = doc.createElement("section");
  section.className = "app-shell monitor-panel";

  const header = doc.createElement("header");
  header.className = "screen-header";
  const eyebrow = doc.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Viewer";
  const heading = doc.createElement("h1");
  heading.textContent = "Live Monitor";
  header.append(eyebrow, heading);

  const status = doc.createElement("p");
  status.className = "status";
  status.id = "status";
  status.setAttribute("role", "status");
  status.textContent = "Enter the room and PIN from the camera phone.";

  const form = doc.createElement("form");
  form.className = "form-grid";
  form.id = "viewer-form";

  const roomLabel = doc.createElement("label");
  const roomInput = doc.createElement("input");
  roomInput.id = "room";
  roomInput.autocomplete = "off";
  roomInput.value = initialRoom;
  roomLabel.append("Room ", roomInput);

  const pinLabel = doc.createElement("label");
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

  const video = doc.createElement("video");
  video.id = "remote";
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;

  const disconnect = doc.createElement("button");
  disconnect.className = "danger";
  disconnect.id = "disconnect";
  disconnect.type = "button";
  disconnect.textContent = "Disconnect";

  section.append(header, status, form, video, disconnect);
  app.replaceChildren(section);

  const config = loadClientConfig();
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
