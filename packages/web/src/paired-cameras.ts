import type { CameraPairingInfo, ViewerPairedCamera } from "@phone-monitor/shared";

export const DEVICE_ID_STORAGE_KEY = "phone-monitor.deviceId";
export const PAIRED_CAMERAS_STORAGE_KEY = "phone-monitor.pairedCameras";
export const CAMERA_PAIRING_STORAGE_KEY = "phone-monitor.cameraPairing";
export const CAMERA_DISPLAY_NAME_STORAGE_KEY = "phone-monitor.cameraDisplayName";
export const DEFAULT_CAMERA_DISPLAY_NAME = "This phone camera";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface StoredCameraPairing extends CameraPairingInfo {
  cameraPairToken: string;
}

export function browserPairStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function getOrCreateDeviceId(storage: StorageLike | undefined): string {
  const existing = storage?.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const id = `device-${crypto.randomUUID?.() ?? randomId()}`;
  storage?.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

export function readPairedCameras(
  storage: StorageLike | undefined
): ViewerPairedCamera[] {
  try {
    const raw = storage?.getItem(PAIRED_CAMERAS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ViewerPairedCamera[];
    return Array.isArray(parsed) ? parsed.filter(isViewerPairedCamera) : [];
  } catch {
    return [];
  }
}

export function upsertPairedCamera(
  storage: StorageLike | undefined,
  camera: ViewerPairedCamera
): void {
  const next = [
    camera,
    ...readPairedCameras(storage).filter((item) => item.pairId !== camera.pairId)
  ];
  storage?.setItem(PAIRED_CAMERAS_STORAGE_KEY, JSON.stringify(next));
}

export function clearPairedCamera(
  storage: StorageLike | undefined,
  pairId: string
): void {
  const next = readPairedCameras(storage).filter((item) => item.pairId !== pairId);
  storage?.setItem(PAIRED_CAMERAS_STORAGE_KEY, JSON.stringify(next));
}

export function readCameraPairing(
  storage: StorageLike | undefined
): StoredCameraPairing | undefined {
  try {
    const raw = storage?.getItem(CAMERA_PAIRING_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredCameraPairing;
    return isCameraPairing(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readCameraDisplayName(storage: StorageLike | undefined): string {
  const stored = storage?.getItem(CAMERA_DISPLAY_NAME_STORAGE_KEY)?.trim();
  if (stored) return stored;
  return readCameraPairing(storage)?.displayName || DEFAULT_CAMERA_DISPLAY_NAME;
}

export function saveCameraDisplayName(
  storage: StorageLike | undefined,
  displayName: string
): string {
  const next = displayName.trim() || DEFAULT_CAMERA_DISPLAY_NAME;
  storage?.setItem(CAMERA_DISPLAY_NAME_STORAGE_KEY, next);
  const pairing = readCameraPairing(storage);
  if (pairing) {
    storage?.setItem(
      CAMERA_PAIRING_STORAGE_KEY,
      JSON.stringify({ ...pairing, displayName: next })
    );
  }
  return next;
}

export function saveCameraPairing(
  storage: StorageLike | undefined,
  pairing: CameraPairingInfo
): void {
  if (!pairing.cameraPairToken) return;
  storage?.setItem(CAMERA_PAIRING_STORAGE_KEY, JSON.stringify(pairing));
  storage?.setItem(CAMERA_DISPLAY_NAME_STORAGE_KEY, pairing.displayName);
}

function randomId(): string {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function isViewerPairedCamera(value: unknown): value is ViewerPairedCamera {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ViewerPairedCamera).pairId === "string" &&
    typeof (value as ViewerPairedCamera).cameraDeviceId === "string" &&
    typeof (value as ViewerPairedCamera).viewerDeviceId === "string" &&
    typeof (value as ViewerPairedCamera).viewerPairToken === "string" &&
    typeof (value as ViewerPairedCamera).displayName === "string" &&
    typeof (value as ViewerPairedCamera).lastConnectedAt === "number"
  );
}

function isCameraPairing(value: unknown): value is StoredCameraPairing {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredCameraPairing).pairId === "string" &&
    typeof (value as StoredCameraPairing).cameraDeviceId === "string" &&
    typeof (value as StoredCameraPairing).displayName === "string" &&
    typeof (value as StoredCameraPairing).cameraPairToken === "string"
  );
}
