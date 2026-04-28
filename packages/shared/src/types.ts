export type RoomId = string;
export type ClientRole = "camera" | "viewer";

export type ConnectionMode = "nearby" | "remote";

export type ConnectionModeLabel =
  | "Same Wi-Fi"
  | "Remote"
  | "Checking connection"
  | "Falling back to remote";

export type RoomStatus =
  | "waiting-for-viewer"
  | "pin-required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "ended";

export type UserFacingConnectionState =
  | "Waiting for viewer"
  | "Checking PIN"
  | "Connecting"
  | "Live"
  | "Reconnecting"
  | "Using relay connection"
  | "Camera offline"
  | "Session ended"
  | "Retry needed";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CreateRoomResponse {
  roomId: RoomId;
  pin: string;
  cameraToken: string;
  expiresAt: number;
  qrPayload: string;
  iceServers: IceServerConfig[];
}

export interface VerifyPinRequest {
  roomId: RoomId;
  pin: string;
}

export interface VerifyPinResponse {
  roomId: RoomId;
  viewerToken: string;
  iceServers: IceServerConfig[];
}

export type SignalingMessage =
  | { type: "join-camera"; roomId: RoomId; cameraToken: string }
  | { type: "join-viewer"; roomId: RoomId; viewerToken: string }
  | { type: "offer"; roomId: RoomId; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; roomId: RoomId; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; roomId: RoomId; candidate: RTCIceCandidateInit }
  | { type: "peer-left"; roomId: RoomId; role: ClientRole }
  | { type: "session-ended"; roomId: RoomId; reason: string }
  | { type: "error"; code: string; message: string };
