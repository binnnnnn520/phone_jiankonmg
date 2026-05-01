import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_QUALITY_STORAGE_KEY,
  buildVideoSenderEncoding,
  buildVideoConstraints,
  configureVideoSender,
  readVideoQuality,
  saveVideoQuality
} from "../src/video-quality.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(entries: Array<[string, string]> = []) {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("default video quality is balanced", () => {
  assert.equal(readVideoQuality(new MemoryStorage()), "balanced");
});

test("data saver maps to lower camera constraints", () => {
  assert.deepEqual(buildVideoConstraints("data-saver"), {
    facingMode: "environment",
    width: { ideal: 640, max: 854 },
    height: { ideal: 360, max: 480 },
    frameRate: { ideal: 15, max: 20 }
  });
});

test("balanced maps to latency-conscious camera constraints", () => {
  assert.deepEqual(buildVideoConstraints("balanced"), {
    facingMode: "environment",
    width: { ideal: 960, max: 1280 },
    height: { ideal: 540, max: 720 },
    frameRate: { ideal: 15, max: 20 }
  });
});

test("sharp maps to higher but bounded camera constraints", () => {
  assert.deepEqual(buildVideoConstraints("sharp"), {
    facingMode: "environment",
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 20, max: 24 }
  });
});

test("video sender encoding is capped for low latency", () => {
  assert.deepEqual(buildVideoSenderEncoding("data-saver"), {
    maxBitrate: 450_000,
    maxFramerate: 15
  });
  assert.deepEqual(buildVideoSenderEncoding("balanced"), {
    maxBitrate: 900_000,
    maxFramerate: 20
  });
  assert.deepEqual(buildVideoSenderEncoding("sharp"), {
    maxBitrate: 1_600_000,
    maxFramerate: 24
  });
});

test("configureVideoSender applies bitrate and framerate caps", async () => {
  const calls: RTCRtpSendParameters[] = [];
  const sender = {
    getParameters: () =>
      ({
        encodings: [{ active: true }]
      }) as RTCRtpSendParameters,
    setParameters: async (params: RTCRtpSendParameters) => {
      calls.push(params);
    }
  };

  await configureVideoSender(sender, "balanced");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.encodings?.[0], {
    active: true,
    maxBitrate: 900_000,
    maxFramerate: 20
  });
});

test("saved video quality is reused", () => {
  const storage = new MemoryStorage();

  saveVideoQuality(storage, "sharp");

  assert.equal(storage.getItem(VIDEO_QUALITY_STORAGE_KEY), "sharp");
  assert.equal(readVideoQuality(storage), "sharp");
});

test("invalid saved video quality falls back to balanced", () => {
  const storage = new MemoryStorage([[VIDEO_QUALITY_STORAGE_KEY, "cinema"]]);

  assert.equal(readVideoQuality(storage), "balanced");
});
