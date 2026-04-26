import { randomBytes } from "node:crypto";
import {
  checkPinAttempt,
  createPin,
  createRoomId,
  hashPin,
  isExpired,
  type CreateRoomResponse,
  type IceServerConfig,
  type RoomId,
  type VerifyPinResponse
} from "@phone-monitor/shared";

interface RoomRecord {
  roomId: RoomId;
  pinHash: string;
  salt: string;
  pinFailedAttempts: number;
  expiresAt: number;
  cameraToken: string;
  cameraConnected: boolean;
  viewerToken?: string;
  viewerTokenIssuedAt?: number;
  viewerConnected: boolean;
}

export type CameraAdmissionResult =
  | "accepted"
  | "already-connected"
  | "rejected";

const DEFAULT_VIEWER_TOKEN_TTL_MS = 30000;

export class RoomStore {
  private readonly rooms = new Map<RoomId, RoomRecord>();

  constructor(
    private readonly params: {
      publicHttpUrl: string;
      roomTtlMs: number;
      pinMaxAttempts: number;
      viewerTokenTtlMs?: number;
      iceServers: IceServerConfig[];
      now: () => number;
    }
  ) {}

  createRoom(): CreateRoomResponse {
    const roomId = createRoomId();
    const pin = createPin({
      length: 6,
      maxAttempts: this.params.pinMaxAttempts
    });
    const salt = randomBytes(12).toString("base64url");
    const cameraToken = randomBytes(18).toString("base64url");
    const expiresAt = this.params.now() + this.params.roomTtlMs;

    this.rooms.set(roomId, {
      roomId,
      pinHash: hashPin(pin, salt),
      salt,
      pinFailedAttempts: 0,
      expiresAt,
      cameraToken,
      cameraConnected: false,
      viewerConnected: false
    });

    return {
      roomId,
      pin,
      cameraToken,
      expiresAt,
      qrPayload: `${this.params.publicHttpUrl}/?room=${encodeURIComponent(
        roomId
      )}`,
      iceServers: this.params.iceServers
    };
  }

  verifyPin(roomId: RoomId, pin: string): VerifyPinResponse {
    const room = this.getActiveRoom(roomId);
    if (!room) throw new Error("ROOM_EXPIRED");
    this.clearExpiredPendingViewer(room);
    if (room.viewerConnected) throw new Error("VIEWER_ALREADY_CONNECTED");
    if (room.viewerToken) throw new Error("VIEWER_ALREADY_RESERVED");

    const result = checkPinAttempt({
      expectedHash: room.pinHash,
      salt: room.salt,
      submittedPin: pin,
      failedAttempts: room.pinFailedAttempts,
      maxAttempts: this.params.pinMaxAttempts
    });

    if (!result.ok) {
      if (room.pinFailedAttempts < this.params.pinMaxAttempts) {
        room.pinFailedAttempts += 1;
      }
      throw new Error(result.locked ? "PIN_LOCKED" : "PIN_INVALID");
    }

    room.viewerToken = randomBytes(18).toString("base64url");
    room.viewerTokenIssuedAt = this.params.now();
    return {
      roomId,
      viewerToken: room.viewerToken,
      iceServers: this.params.iceServers
    };
  }

  hasRoom(roomId: RoomId): boolean {
    return this.getActiveRoom(roomId) !== undefined;
  }

  consumeViewerToken(roomId: RoomId, token: string): boolean {
    const room = this.getActiveRoom(roomId);
    if (room) this.clearExpiredPendingViewer(room);
    if (!room || room.viewerToken !== token || room.viewerConnected) {
      return false;
    }

    room.viewerConnected = true;
    return true;
  }

  releaseViewer(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.viewerConnected = false;
      delete room.viewerToken;
      delete room.viewerTokenIssuedAt;
    }
  }

  admitCamera(roomId: RoomId, token: string): CameraAdmissionResult {
    const room = this.getActiveRoom(roomId);
    if (!room || room.cameraToken !== token) return "rejected";
    if (room.cameraConnected) return "already-connected";

    room.cameraConnected = true;
    return "accepted";
  }

  releaseCamera(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cameraConnected = false;
    }
  }

  private getActiveRoom(roomId: RoomId): RoomRecord | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    if (isExpired(this.params.now(), room.expiresAt)) {
      this.rooms.delete(roomId);
      return undefined;
    }
    return room;
  }

  private clearExpiredPendingViewer(room: RoomRecord): void {
    if (
      room.viewerConnected ||
      !room.viewerToken ||
      room.viewerTokenIssuedAt === undefined
    ) {
      return;
    }

    const ttl = this.params.viewerTokenTtlMs ?? DEFAULT_VIEWER_TOKEN_TTL_MS;
    if (this.params.now() - room.viewerTokenIssuedAt > ttl) {
      delete room.viewerToken;
      delete room.viewerTokenIssuedAt;
    }
  }
}
