import assert from "node:assert/strict";
import test from "node:test";
import {
  createWakeLockController,
  describeCameraError,
  formatWakeLockGuidance,
  requestWakeLock,
  stopStream
} from "../src/safety.js";

test("describeCameraError explains denied camera permission", () => {
  assert.match(
    describeCameraError(new DOMException("Denied", "NotAllowedError"), true),
    /permission was denied/i
  );
});

test("describeCameraError explains insecure network origins", () => {
  assert.match(
    describeCameraError(new DOMException("Denied", "NotAllowedError"), false),
    /secure HTTPS link or localhost/i
  );
});

test("describeCameraError explains remote connection failures after camera starts", () => {
  const message = describeCameraError(
    new Error("Could not create monitoring room"),
    true,
    true
  );

  assert.match(message, /remote connection/i);
  assert.doesNotMatch(message.toLowerCase(), /server|signaling|turn|nat|deploy/);
});

test("describeCameraError keeps insecure origin messaging free of deployment terms", () => {
  assert.doesNotMatch(
    describeCameraError(new DOMException("Denied", "NotAllowedError"), false),
    /deploy/i
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

test("createWakeLockController returns awake when screen wake lock succeeds", async () => {
  const calls: string[] = [];
  const controller = createWakeLockController({
    nav: {
      wakeLock: {
        request: async (type: "screen") => {
          calls.push(type);
          return {};
        }
      }
    }
  });

  assert.equal(await controller.request(), "awake");
  assert.equal(controller.state, "awake");
  assert.deepEqual(calls, ["screen"]);
});

test("createWakeLockController returns unsupported when screen wake lock is unavailable", async () => {
  const controller = createWakeLockController({ nav: {} });

  assert.equal(await controller.request(), "unsupported");
  assert.equal(controller.state, "unsupported");
});

test("createWakeLockController returns blocked when screen wake lock is rejected", async () => {
  const controller = createWakeLockController({
    nav: {
      wakeLock: {
        request: async () => {
          throw new DOMException("Hidden", "NotAllowedError");
        }
      }
    }
  });

  assert.equal(await controller.request(), "blocked");
  assert.equal(controller.state, "blocked");
});

test("createWakeLockController requests wake lock again when visibility returns", async () => {
  const calls: string[] = [];
  let visibilityListener: (() => void) | undefined;
  const doc = {
    visibilityState: "visible",
    addEventListener(type: string, listener: () => void) {
      if (type === "visibilitychange") visibilityListener = listener;
    },
    removeEventListener() {
      visibilityListener = undefined;
    }
  };
  let releaseCount = 0;
  const controller = createWakeLockController({
    doc,
    nav: {
      wakeLock: {
        request: async (type: "screen") => {
          calls.push(type);
          return {
            release: async () => {
              releaseCount += 1;
            }
          };
        }
      }
    }
  });

  assert.equal(await controller.request(), "awake");
  visibilityListener?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, ["screen", "screen"]);
  assert.equal(releaseCount, 1);
});

test("createWakeLockController releases and removes visibility listener on dispose", async () => {
  let removed = false;
  let releaseCount = 0;
  const controller = createWakeLockController({
    doc: {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener(type: string) {
        if (type === "visibilitychange") removed = true;
      }
    },
    nav: {
      wakeLock: {
        request: async () => ({
          release: async () => {
            releaseCount += 1;
          }
        })
      }
    }
  });

  assert.equal(await controller.request(), "awake");
  await controller.dispose();

  assert.equal(controller.state, "blocked");
  assert.equal(removed, true);
  assert.equal(releaseCount, 1);
});

test("formatWakeLockGuidance uses compact monitoring copy", () => {
  assert.equal(formatWakeLockGuidance("awake"), "Screen stays awake");
  assert.equal(formatWakeLockGuidance("unsupported"), "Keep this phone open");
  assert.equal(formatWakeLockGuidance("blocked"), "Keep this phone open");
});
