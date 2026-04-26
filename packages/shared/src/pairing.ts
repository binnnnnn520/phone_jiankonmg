import { createHash, randomBytes } from "node:crypto";
import type { RoomId } from "./types.js";

export interface PinPolicy {
  length: 4 | 5 | 6;
  maxAttempts: number;
}

export interface PinCheckResult {
  ok: boolean;
  locked: boolean;
  attemptsRemaining: number;
}

export function createRoomId(): RoomId {
  return randomBytes(12).toString("base64url");
}

export function createPin(policy: PinPolicy): string {
  const upper = 10 ** policy.length;
  return String(Math.floor(Math.random() * upper)).padStart(policy.length, "0");
}

export function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function isExpired(now: number, expiresAt: number): boolean {
  return now >= expiresAt;
}

export function checkPinAttempt(params: {
  expectedHash: string;
  salt: string;
  submittedPin: string;
  failedAttempts: number;
  maxAttempts: number;
}): PinCheckResult {
  const lockedBeforeAttempt = params.failedAttempts >= params.maxAttempts;
  if (lockedBeforeAttempt) {
    return { ok: false, locked: true, attemptsRemaining: 0 };
  }

  const ok = hashPin(params.submittedPin, params.salt) === params.expectedHash;
  const failedAttempts = ok ? params.failedAttempts : params.failedAttempts + 1;
  const attemptsRemaining = Math.max(params.maxAttempts - failedAttempts, 0);

  return {
    ok,
    locked: !ok && attemptsRemaining === 0,
    attemptsRemaining
  };
}
