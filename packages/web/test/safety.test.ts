import assert from "node:assert/strict";
import test from "node:test";
import { describeCameraError, requestWakeLock, stopStream } from "../src/safety.js";

test("describeCameraError explains denied camera permission", () => {
  assert.match(
    describeCameraError(new DOMException("Denied", "NotAllowedError"), true),
    /permission was denied/i
  );
});

test("describeCameraError explains insecure network origins", () => {
  assert.match(
    describeCameraError(new DOMException("Denied", "NotAllowedError"), false),
    /HTTPS or localhost/i
  );
});

test("describeCameraError explains missing camera hardware", () => {
  assert.equal(
    describeCameraError(new DOMException("Missing", "NotFoundError")),
    "No camera was found on this device."
  );
});

test("stopStream stops every media track", () => {
  const stopped: string[] = [];
  stopStream({
    getTracks: () => [
      { stop: () => stopped.push("video") },
      { stop: () => stopped.push("audio") }
    ]
  });

  assert.deepEqual(stopped, ["video", "audio"]);
});

test("requestWakeLock returns undefined when screen wake lock is unavailable", async () => {
  assert.equal(await requestWakeLock({}), undefined);
});

test("requestWakeLock returns undefined when the browser rejects the wake lock", async () => {
  assert.equal(
    await requestWakeLock({
      wakeLock: {
        request: async () => {
          throw new DOMException("Hidden document", "NotAllowedError");
        }
      }
    }),
    undefined
  );
});

test("requestWakeLock asks for a screen wake lock when supported", async () => {
  const calls: string[] = [];
  const sentinel = {};

  assert.equal(
    await requestWakeLock({
      wakeLock: {
        request: async (type: "screen") => {
          calls.push(type);
          return sentinel;
        }
      }
    }),
    sentinel
  );
  assert.deepEqual(calls, ["screen"]);
});
