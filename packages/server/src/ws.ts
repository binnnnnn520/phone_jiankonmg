import type { Server as HttpServer } from "node:http";
import type { SignalingMessage } from "@phone-monitor/shared";
import { WebSocket, WebSocketServer } from "ws";
import type { RoomStore } from "./store.js";

type PeerRole = "camera" | "viewer";

interface Peer {
  role: PeerRole;
  roomId: string;
  socket: WebSocket;
  viewerToken?: string;
}

type ClientForwardableMessage = Extract<
  SignalingMessage,
  { type: "offer" | "answer" | "ice-candidate" | "session-ended" }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function parseSignalingMessage(raw: string): SignalingMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(value) || !hasString(value, "type")) return undefined;

  switch (value.type) {
    case "join-camera":
      return hasString(value, "roomId")
        ? (value as SignalingMessage)
        : undefined;
    case "join-viewer":
      return hasString(value, "roomId") && hasString(value, "viewerToken")
        ? (value as SignalingMessage)
        : undefined;
    case "offer":
    case "answer":
      return hasString(value, "roomId") && isRecord(value.sdp)
        ? (value as SignalingMessage)
        : undefined;
    case "ice-candidate":
      return hasString(value, "roomId") && isRecord(value.candidate)
        ? (value as SignalingMessage)
        : undefined;
    case "session-ended":
      return hasString(value, "roomId") && hasString(value, "reason")
        ? (value as SignalingMessage)
        : undefined;
    case "peer-left":
      return hasString(value, "roomId") && hasString(value, "role")
        ? (value as SignalingMessage)
        : undefined;
    case "error":
      return hasString(value, "code") && hasString(value, "message")
        ? (value as SignalingMessage)
        : undefined;
    default:
      return undefined;
  }
}

function isClientForwardable(
  message: SignalingMessage
): message is ClientForwardableMessage {
  return (
    message.type === "offer" ||
    message.type === "answer" ||
    message.type === "ice-candidate" ||
    message.type === "session-ended"
  );
}

export function createSignalingServer(
  server: HttpServer,
  store: RoomStore
): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const peers = new Map<string, Peer[]>();

  function send(socket: WebSocket, message: SignalingMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function roomPeers(roomId: string): Peer[] {
    const existingPeers = peers.get(roomId);
    if (existingPeers) return existingPeers;

    const list: Peer[] = [];
    peers.set(roomId, list);
    return list;
  }

  function forward(sender: Peer, message: SignalingMessage): void {
    for (const peer of roomPeers(sender.roomId)) {
      if (peer.socket !== sender.socket) {
        send(peer.socket, message);
      }
    }
  }

  function notifyCameraAboutWaitingViewers(camera: Peer): void {
    for (const peer of roomPeers(camera.roomId)) {
      if (peer.role === "viewer" && peer.viewerToken) {
        send(camera.socket, {
          type: "join-viewer",
          roomId: camera.roomId,
          viewerToken: peer.viewerToken
        });
      }
    }
  }

  wss.on("connection", (socket) => {
    let currentPeer: Peer | undefined;

    socket.on("message", (raw) => {
      const message = parseSignalingMessage(raw.toString());
      if (!message) {
        send(socket, {
          type: "error",
          code: "BAD_MESSAGE",
          message: "Message must match the signaling protocol"
        });
        return;
      }

      if (message.type === "join-camera") {
        if (!store.hasRoom(message.roomId)) {
          send(socket, {
            type: "error",
            code: "ROOM_NOT_FOUND",
            message: "Room expired or not found"
          });
          return;
        }

        currentPeer = {
          role: "camera",
          roomId: message.roomId,
          socket
        };
        roomPeers(message.roomId).push(currentPeer);
        notifyCameraAboutWaitingViewers(currentPeer);
        return;
      }

      if (message.type === "join-viewer") {
        if (!store.consumeViewerToken(message.roomId, message.viewerToken)) {
          send(socket, {
            type: "error",
            code: "VIEWER_REJECTED",
            message: "Viewer token rejected"
          });
          return;
        }

        currentPeer = {
          role: "viewer",
          roomId: message.roomId,
          socket,
          viewerToken: message.viewerToken
        };
        roomPeers(message.roomId).push(currentPeer);
        forward(currentPeer, message);
        return;
      }

      if (!currentPeer) {
        send(socket, {
          type: "error",
          code: "JOIN_REQUIRED",
          message: "Join a room before signaling"
        });
        return;
      }

      if (!isClientForwardable(message)) {
        send(socket, {
          type: "error",
          code: "FORBIDDEN_MESSAGE",
          message: "Message type cannot be sent by clients"
        });
        return;
      }

      if (message.roomId !== currentPeer.roomId) {
        send(socket, {
          type: "error",
          code: "ROOM_MISMATCH",
          message: "Message room does not match joined room"
        });
        return;
      }

      forward(currentPeer, message);
    });

    socket.on("close", () => {
      if (!currentPeer) return;

      const nextPeers = roomPeers(currentPeer.roomId).filter(
        (peer) => peer.socket !== socket
      );
      peers.set(currentPeer.roomId, nextPeers);

      if (currentPeer.role === "viewer") {
        store.releaseViewer(currentPeer.roomId);
      }

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
