import assert from "node:assert/strict";
import test from "node:test";
import type { ViewerPairedCamera } from "@phone-monitor/shared";
import {
  CAMERA_PAIRING_STORAGE_KEY,
  CAMERA_DISPLAY_NAME_STORAGE_KEY,
  PAIRED_CAMERAS_STORAGE_KEY,
  clearPairedCamera,
  getOrCreateDeviceId,
  readCameraDisplayName,
  readCameraPairing,
  readPairedCameras,
  saveCameraDisplayName,
  saveCameraPairing,
  upsertPairedCamera
} from "../src/paired-cameras.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("getOrCreateDeviceId returns a stable local browser identity", () => {
  const storage = new MemoryStorage();

  const first = getOrCreateDeviceId(storage);
  const second = getOrCreateDeviceId(storage);

  assert.ok(first.startsWith("device-"));
  assert.equal(second, first);
});

test("upsertPairedCamera stores and updates viewer paired cameras", () => {
  const storage = new MemoryStorage();

  upsertPairedCamera(storage, {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    viewerDeviceId: "viewer-1",
    viewerPairToken: "token-1",
    displayName: "Hallway",
    lastConnectedAt: 1000
  });
  upsertPairedCamera(storage, {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    viewerDeviceId: "viewer-1",
    viewerPairToken: "token-2",
    displayName: "Front door",
    lastConnectedAt: 2000
  });

  assert.deepEqual(readPairedCameras(storage), [
    {
      pairId: "pair-1",
      cameraDeviceId: "camera-1",
      viewerDeviceId: "viewer-1",
      viewerPairToken: "token-2",
      displayName: "Front door",
      lastConnectedAt: 2000
    }
  ]);
  assert.ok(storage.getItem(PAIRED_CAMERAS_STORAGE_KEY));
});

test("sortPairedCameras puts live cameras first, then newest connection", async () => {
  const pairedCameraModule = await import("../src/paired-cameras.js") as {
    sortPairedCameras?: (
      cameras: ViewerPairedCamera[],
      statuses: Record<string, "live" | "offline" | "checking">
    ) => ViewerPairedCamera[];
  };
  assert.equal(typeof pairedCameraModule.sortPairedCameras, "function");

  const oldLive = buildCamera("pair-old-live", "Old live", 1000);
  const newOffline = buildCamera("pair-new-offline", "New offline", 4000);
  const newLive = buildCamera("pair-new-live", "New live", 3000);
  const checking = buildCamera("pair-checking", "Checking", 5000);

  assert.deepEqual(
    pairedCameraModule
      .sortPairedCameras?.([newOffline, oldLive, checking, newLive], {
        "pair-old-live": "live",
        "pair-new-live": "live",
        "pair-new-offline": "offline",
        "pair-checking": "checking"
      })
      .map((camera) => camera.pairId),
    ["pair-new-live", "pair-old-live", "pair-checking", "pair-new-offline"]
  );
});

test("filterPairedCameras matches camera display names case-insensitively", async () => {
  const pairedCameraModule = await import("../src/paired-cameras.js") as {
    filterPairedCameras?: (
      cameras: ViewerPairedCamera[],
      query: string
    ) => ViewerPairedCamera[];
  };
  assert.equal(typeof pairedCameraModule.filterPairedCameras, "function");

  const frontDoor = buildCamera("pair-front", "Front Door", 1000);
  const nursery = buildCamera("pair-nursery", "Nursery", 2000);

  assert.deepEqual(
    pairedCameraModule
      .filterPairedCameras?.([frontDoor, nursery], " door ")
      .map((camera) => camera.pairId),
    ["pair-front"]
  );
  assert.deepEqual(
    pairedCameraModule
      .filterPairedCameras?.([frontDoor, nursery], "")
      .map((camera) => camera.pairId),
    ["pair-front", "pair-nursery"]
  );
});

test("camera pairing storage can be saved and cleared", () => {
  const storage = new MemoryStorage();

  saveCameraPairing(storage, {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    displayName: "Camera",
    cameraPairToken: "camera-token"
  });

  assert.deepEqual(readCameraPairing(storage), {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    displayName: "Camera",
    cameraPairToken: "camera-token"
  });
  assert.ok(storage.getItem(CAMERA_PAIRING_STORAGE_KEY));

  clearPairedCamera(storage, "pair-1");
  assert.deepEqual(readPairedCameras(storage), []);
});

test("clearPairedCamera removes only the selected saved camera", () => {
  const storage = new MemoryStorage();
  upsertPairedCamera(storage, buildCamera("pair-front", "Front door", 1000));
  upsertPairedCamera(storage, buildCamera("pair-nursery", "Nursery", 2000));

  clearPairedCamera(storage, "pair-front");

  assert.deepEqual(
    readPairedCameras(storage).map((camera) => camera.pairId),
    ["pair-nursery"]
  );
});

test("camera display name can be saved before or after pairing", () => {
  const storage = new MemoryStorage();

  assert.equal(readCameraDisplayName(storage), "This phone camera");

  saveCameraDisplayName(storage, "Kitchen phone");
  assert.equal(readCameraDisplayName(storage), "Kitchen phone");
  assert.equal(storage.getItem(CAMERA_DISPLAY_NAME_STORAGE_KEY), "Kitchen phone");

  saveCameraPairing(storage, {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    displayName: "Old name",
    cameraPairToken: "camera-token"
  });
  saveCameraDisplayName(storage, "Front door");

  assert.equal(readCameraDisplayName(storage), "Front door");
  assert.deepEqual(readCameraPairing(storage), {
    pairId: "pair-1",
    cameraDeviceId: "camera-1",
    displayName: "Front door",
    cameraPairToken: "camera-token"
  });
});

function buildCamera(
  pairId: string,
  displayName: string,
  lastConnectedAt: number
): ViewerPairedCamera {
  return {
    pairId,
    cameraDeviceId: `camera-${pairId}`,
    viewerDeviceId: "viewer-device",
    viewerPairToken: `viewer-token-${pairId}`,
    displayName,
    lastConnectedAt
  };
}
