import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPinAttempt,
  createPin,
  createRoomId,
  hashPin,
  isExpired
} from "../src/pairing.js";

test("creates URL-safe room IDs", () => {
  const roomId = createRoomId();
  assert.match(roomId, /^[A-Za-z0-9_-]+$/);
  assert.ok(roomId.length >= 16);
});

test("creates fixed-length numeric PINs", () => {
  const pin = createPin({ length: 6, maxAttempts: 5 });
  assert.match(pin, /^[0-9]{6}$/);
});

test("accepts a correct PIN hash", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);

  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "123456",
      failedAttempts: 2,
      maxAttempts: 5
    }),
    { ok: true, locked: false, attemptsRemaining: 3 }
  );
});

test("locks after the final failed PIN attempt", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);

  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "000000",
      failedAttempts: 4,
      maxAttempts: 5
    }),
    { ok: false, locked: true, attemptsRemaining: 0 }
  );
});

test("returns locked when PIN attempts are already exhausted", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);

  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "123456",
      failedAttempts: 5,
      maxAttempts: 5
    }),
    { ok: false, locked: true, attemptsRemaining: 0 }
  );
});

test("decrements attempts without locking on a non-final wrong PIN", () => {
  const salt = "room-salt";
  const expectedHash = hashPin("123456", salt);

  assert.deepEqual(
    checkPinAttempt({
      expectedHash,
      salt,
      submittedPin: "000000",
      failedAttempts: 2,
      maxAttempts: 5
    }),
    { ok: false, locked: false, attemptsRemaining: 2 }
  );
});

test("expires rooms at the configured timestamp", () => {
  assert.equal(isExpired(1000, 999), true);
  assert.equal(isExpired(1000, 1001), false);
});
