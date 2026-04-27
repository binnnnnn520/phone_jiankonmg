export interface WakeLockSentinelLike {
  release?: () => Promise<void>;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

export interface StoppableMediaTrack {
  stop: () => void;
}

export interface StoppableMediaStream {
  getTracks: () => StoppableMediaTrack[];
}

export async function requestWakeLock(
  nav: WakeLockNavigatorLike = navigator as WakeLockNavigatorLike
): Promise<WakeLockSentinelLike | undefined> {
  try {
    return await nav.wakeLock?.request("screen");
  } catch {
    return undefined;
  }
}

export async function releaseWakeLock(
  sentinel: WakeLockSentinelLike | undefined
): Promise<void> {
  try {
    await sentinel?.release?.();
  } catch {
    // Wake lock release failures are not actionable during shutdown.
  }
}

export function describeCameraError(
  error: unknown,
  isSecureContext: boolean = globalThis.isSecureContext,
  cameraStarted = false
): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    if (!isSecureContext) {
      return "Camera access requires HTTPS or localhost. Open this page on localhost for desktop testing, or deploy it over HTTPS for phones.";
    }
    return "Camera permission was denied. Allow camera access and start monitoring again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  if (cameraStarted) {
    return "Camera started, but the signaling server could not be reached. Start the signaling server and reload this camera page.";
  }
  return "The camera could not start. Close other camera apps and try again.";
}

export function stopStream(stream: StoppableMediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
