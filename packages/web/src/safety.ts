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
  return nav.wakeLock?.request("screen");
}

export function describeCameraError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Camera permission was denied. Allow camera access and start monitoring again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  return "The camera could not start. Close other camera apps and try again.";
}

export function stopStream(stream: StoppableMediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
