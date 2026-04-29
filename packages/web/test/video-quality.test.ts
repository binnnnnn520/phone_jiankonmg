import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_QUALITY_STORAGE_KEY,
  buildVideoConstraints,
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

test("sharp maps to higher camera constraints", () => {
  assert.deepEqual(buildVideoConstraints("sharp"), {
    facingMode: "environment",
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
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
