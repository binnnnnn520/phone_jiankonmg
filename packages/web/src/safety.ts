export interface WakeLockSentinelLike {
  release?: () => Promise<void>;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

export type WakeLockState = "awake" | "unsupported" | "blocked";

export interface WakeLockDocumentLike {
  visibilityState?: string;
  addEventListener?: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener?: (type: "visibilitychange", listener: () => void) => void;
}

export interface WakeLockController {
  readonly state: WakeLockState;
  request: () => Promise<WakeLockState>;
  release: () => Promise<void>;
  dispose: () => Promise<void>;
}

export interface CreateWakeLockControllerOptions {
  nav?: WakeLockNavigatorLike;
  doc?: WakeLockDocumentLike;
  onState?: (state: WakeLockState) => void;
}

export interface StoppableMediaTrack {
  stop: () => void;
}

export interface StoppableMediaStream {
  getTracks: () => StoppableMediaTrack[];
}

export async function requestWakeLock(
  nav: WakeLockNavigatorLike = (
    globalThis as typeof globalThis & { navigator?: WakeLockNavigatorLike }
  ).navigator ?? {}
): Promise<WakeLockSentinelLike | undefined> {
  try {
    return await nav.wakeLock?.request("screen");
  } catch {
    return undefined;
  }
}

export async function releaseWakeLock(
  sentinel: (WakeLockSentinelLike & { dispose?: () => Promise<void> }) | undefined
): Promise<void> {
  try {
    if (sentinel?.dispose) {
      await sentinel.dispose();
      return;
    }
    await sentinel?.release?.();
  } catch {
    // Wake lock release failures are not actionable during shutdown.
  }
}

export function formatWakeLockGuidance(state: WakeLockState): string {
  return state === "awake" ? "Screen stays awake" : "Keep this phone open";
}

export function createWakeLockController(
  options: CreateWakeLockControllerOptions = {}
): WakeLockController {
  const nav =
    options.nav ??
    ((globalThis as typeof globalThis & { navigator?: WakeLockNavigatorLike })
      .navigator ??
      {});
  const doc =
    options.doc ??
    (globalThis as typeof globalThis & { document?: WakeLockDocumentLike }).document;
  let state: WakeLockState = nav.wakeLock ? "blocked" : "unsupported";
  let sentinel: WakeLockSentinelLike | undefined;
  let active = false;
  let disposed = false;
  let requestInFlight: Promise<WakeLockState> | undefined;

  function setState(nextState: WakeLockState): void {
    state = nextState;
    options.onState?.(nextState);
  }

  async function releaseCurrentWakeLock(): Promise<void> {
    const current = sentinel;
    sentinel = undefined;
    await releaseWakeLock(current);
  }

  async function request(): Promise<WakeLockState> {
    active = true;
    if (disposed) return state;
    if (requestInFlight) return requestInFlight;

    requestInFlight = (async () => {
      if (!nav.wakeLock) {
        await releaseCurrentWakeLock();
        setState("unsupported");
        return state;
      }

      try {
        await releaseCurrentWakeLock();
        sentinel = await nav.wakeLock.request("screen");
        setState("awake");
      } catch {
        sentinel = undefined;
        setState("blocked");
      }
      return state;
    })().finally(() => {
      requestInFlight = undefined;
    });

    return requestInFlight;
  }

  async function release(): Promise<void> {
    active = false;
    await releaseCurrentWakeLock();
    setState(nav.wakeLock ? "blocked" : "unsupported");
  }

  async function dispose(): Promise<void> {
    disposed = true;
    active = false;
    doc?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    await releaseCurrentWakeLock();
    setState(nav.wakeLock ? "blocked" : "unsupported");
  }

  function handleVisibilityChange(): void {
    if (!active || disposed) return;
    if ((doc?.visibilityState ?? "visible") !== "visible") return;
    void request();
  }

  doc?.addEventListener?.("visibilitychange", handleVisibilityChange);

  return {
    get state() {
      return state;
    },
    request,
    release,
    dispose
  };
}

export function describeCameraError(
  error: unknown,
  isSecureContext: boolean = globalThis.isSecureContext,
  cameraStarted = false
): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    if (!isSecureContext) {
      return "Camera access requires a secure HTTPS link or localhost. Open a secure link and try again.";
    }
    return "Camera permission was denied. Allow camera access and start monitoring again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  if (cameraStarted) {
    return "Camera started, but the remote connection is not available. Check the connection and reload this camera page.";
  }
  return "The camera could not start. Close other camera apps and try again.";
}

export function stopStream(stream: StoppableMediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
