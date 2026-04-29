import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  checkPinAttempt,
  type CameraPairingInfo,
  createPin,
  createRoomId,
  hashPin,
  isExpired,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type IceServerConfig,
  type PairReconnectRequest,
  type PairReconnectResponse,
  type PairStatusResponse,
  type RoomId,
  type VerifyPinRequest,
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
  pairId: string;
}

interface PairRecord {
  pairId: string;
  cameraDeviceId: string;
  cameraPairTokenHash: string;
  cameraPairTokenSalt: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
  currentRoomId?: RoomId;
  viewerDeviceId?: string;
  viewerPairTokenHash?: string;
  viewerPairTokenSalt?: string;
}

export type CameraAdmissionResult =
  | "accepted"
  | "already-connected"
  | "rejected";

const DEFAULT_VIEWER_TOKEN_TTL_MS = 30000;

export class RoomStore {
  private readonly rooms = new Map<RoomId, RoomRecord>();
  private readonly pairs = new Map<string, PairRecord>();

  constructor(
    private readonly params: {
      publicHttpUrl: string;
      roomTtlMs: number;
      pinMaxAttempts: number;
      viewerTokenTtlMs?: number;
      iceServers: IceServerConfig[];
      now: () => number;
      pairStoreFile?: string;
    }
  ) {
    this.loadPairs();
  }

  createRoom(request: CreateRoomRequest = {}): CreateRoomResponse {
    const roomId = createRoomId();
    const pin = createPin({
      length: 6,
      maxAttempts: this.params.pinMaxAttempts
    });
    const salt = randomBytes(12).toString("base64url");
    const cameraToken = randomBytes(18).toString("base64url");
    const expiresAt = this.params.now() + this.params.roomTtlMs;
    const pairing = this.resolveCameraPairing(request);

    this.rooms.set(roomId, {
      roomId,
      pinHash: hashPin(pin, salt),
      salt,
      pinFailedAttempts: 0,
      expiresAt,
      cameraToken,
      cameraConnected: false,
      viewerConnected: false,
      pairId: pairing.pairId
    });
    pairing.record.currentRoomId = roomId;
    pairing.record.lastSeenAt = this.params.now();
    this.persistPairs();

    return {
      roomId,
      pin,
      cameraToken,
      expiresAt,
      qrPayload: `${this.params.publicHttpUrl}/?room=${encodeURIComponent(
        roomId
      )}`,
      iceServers: this.params.iceServers,
      cameraPairing: pairing.info
    };
  }

  verifyPin(
    roomId: RoomId,
    pin: string,
    request: Omit<VerifyPinRequest, "roomId" | "pin"> = {}
  ): VerifyPinResponse {
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
    const pairedCamera = this.issueViewerPair(room, request);
    return {
      roomId,
      viewerToken: room.viewerToken,
      iceServers: this.params.iceServers,
      pairedCamera
    };
  }

  reconnectPair(request: PairReconnectRequest): PairReconnectResponse {
    const pair = this.pairs.get(request.pairId);
    if (!pair || !this.validViewerPairToken(pair, request)) {
      throw new Error("PAIR_REJECTED");
    }

    const room = pair.currentRoomId
      ? this.getActiveRoom(pair.currentRoomId)
      : undefined;
    if (!room || !room.cameraConnected) {
      throw new Error("PAIR_CAMERA_OFFLINE");
    }
    this.clearExpiredPendingViewer(room);
    if (room.viewerConnected) throw new Error("VIEWER_ALREADY_CONNECTED");

    room.viewerToken = randomBytes(18).toString("base64url");
    room.viewerTokenIssuedAt = this.params.now();
    pair.lastSeenAt = this.params.now();
    this.persistPairs();

    return {
      roomId: room.roomId,
      viewerToken: room.viewerToken,
      iceServers: this.params.iceServers,
      pairedCamera: this.viewerPairForResponse(pair, request.viewerPairToken)
    };
  }

  pairStatus(request: PairReconnectRequest): PairStatusResponse {
    const pair = this.pairs.get(request.pairId);
    if (!pair || !this.validViewerPairToken(pair, request)) {
      throw new Error("PAIR_REJECTED");
    }
    const room = pair.currentRoomId
      ? this.getActiveRoom(pair.currentRoomId)
      : undefined;

    return {
      pairId: pair.pairId,
      displayName: pair.displayName,
      status: room?.cameraConnected ? "live" : "offline",
      lastSeenAt: pair.lastSeenAt
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
    const pair = this.pairs.get(room.pairId);
    if (pair) {
      pair.currentRoomId = roomId;
      pair.lastSeenAt = this.params.now();
      this.persistPairs();
    }
    return "accepted";
  }

  releaseCamera(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cameraConnected = false;
      const pair = this.pairs.get(room.pairId);
      if (pair) {
        pair.lastSeenAt = this.params.now();
        this.persistPairs();
      }
    }
  }

  private resolveCameraPairing(request: CreateRoomRequest): {
    pairId: string;
    record: PairRecord;
    info: CameraPairingInfo;
  } {
    const existingPair =
      request.pairId && request.cameraPairToken
        ? this.pairs.get(request.pairId)
        : undefined;
    if (
      existingPair &&
      this.validToken(
        request.cameraPairToken!,
        existingPair.cameraPairTokenHash,
        existingPair.cameraPairTokenSalt
      )
    ) {
      if (request.displayName?.trim()) {
        existingPair.displayName = request.displayName.trim();
      }
      existingPair.lastSeenAt = this.params.now();
      this.persistPairs();
      return {
        pairId: existingPair.pairId,
        record: existingPair,
        info: {
          pairId: existingPair.pairId,
          cameraDeviceId: existingPair.cameraDeviceId,
          displayName: existingPair.displayName
        }
      };
    }

    const pairId = randomBytes(12).toString("base64url");
    const cameraDeviceId =
      request.cameraDeviceId?.trim() || randomBytes(12).toString("base64url");
    const displayName = request.displayName?.trim() || "Paired camera";
    const cameraPairToken = randomBytes(24).toString("base64url");
    const cameraPairTokenSalt = randomBytes(12).toString("base64url");
    const record: PairRecord = {
      pairId,
      cameraDeviceId,
      cameraPairTokenHash: hashPin(cameraPairToken, cameraPairTokenSalt),
      cameraPairTokenSalt,
      displayName,
      createdAt: this.params.now(),
      lastSeenAt: this.params.now()
    };
    this.pairs.set(pairId, record);
    this.persistPairs();

    return {
      pairId,
      record,
      info: {
        pairId,
        cameraDeviceId,
        displayName,
        cameraPairToken
      }
    };
  }

  private issueViewerPair(
    room: RoomRecord,
    request: Omit<VerifyPinRequest, "roomId" | "pin">
  ): VerifyPinResponse["pairedCamera"] {
    const pair = this.pairs.get(room.pairId);
    if (!pair) throw new Error("PAIR_REJECTED");

    const viewerDeviceId =
      request.viewerDeviceId?.trim() || randomBytes(12).toString("base64url");
    const viewerPairToken = randomBytes(24).toString("base64url");
    const viewerPairTokenSalt = randomBytes(12).toString("base64url");
    pair.viewerDeviceId = viewerDeviceId;
    pair.viewerPairTokenHash = hashPin(viewerPairToken, viewerPairTokenSalt);
    pair.viewerPairTokenSalt = viewerPairTokenSalt;
    if (request.displayName?.trim()) pair.displayName = request.displayName.trim();
    pair.lastSeenAt = this.params.now();
    this.persistPairs();

    return this.viewerPairForResponse(pair, viewerPairToken);
  }

  private viewerPairForResponse(
    pair: PairRecord,
    viewerPairToken: string
  ): VerifyPinResponse["pairedCamera"] {
    return {
      pairId: pair.pairId,
      cameraDeviceId: pair.cameraDeviceId,
      viewerDeviceId: pair.viewerDeviceId ?? "",
      viewerPairToken,
      displayName: pair.displayName,
      lastConnectedAt: this.params.now()
    };
  }

  private validViewerPairToken(
    pair: PairRecord,
    request: PairReconnectRequest
  ): boolean {
    return (
      pair.viewerDeviceId === request.viewerDeviceId &&
      Boolean(pair.viewerPairTokenHash && pair.viewerPairTokenSalt) &&
      this.validToken(
        request.viewerPairToken,
        pair.viewerPairTokenHash!,
        pair.viewerPairTokenSalt!
      )
    );
  }

  private validToken(token: string, expectedHash: string, salt: string): boolean {
    return hashPin(token, salt) === expectedHash;
  }

  private loadPairs(): void {
    if (!this.params.pairStoreFile || !existsSync(this.params.pairStoreFile)) {
      return;
    }

    try {
      const raw = readFileSync(this.params.pairStoreFile, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const pair of parsed) {
        if (this.isPersistedPairRecord(pair)) {
          const { currentRoomId: _currentRoomId, ...persistedPair } = pair;
          this.pairs.set(pair.pairId, persistedPair);
        }
      }
    } catch {
      this.pairs.clear();
    }
  }

  private persistPairs(): void {
    if (!this.params.pairStoreFile) return;

    mkdirSync(dirname(this.params.pairStoreFile), { recursive: true });
    const pairs = Array.from(this.pairs.values()).map((pair) => {
      const { currentRoomId: _currentRoomId, ...persistedPair } = pair;
      return persistedPair;
    });
    writeFileSync(this.params.pairStoreFile, JSON.stringify(pairs, null, 2));
  }

  private isPersistedPairRecord(value: unknown): value is PairRecord {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as PairRecord).pairId === "string" &&
      typeof (value as PairRecord).cameraDeviceId === "string" &&
      typeof (value as PairRecord).cameraPairTokenHash === "string" &&
      typeof (value as PairRecord).cameraPairTokenSalt === "string" &&
      typeof (value as PairRecord).displayName === "string" &&
      typeof (value as PairRecord).createdAt === "number" &&
      typeof (value as PairRecord).lastSeenAt === "number"
    );
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
