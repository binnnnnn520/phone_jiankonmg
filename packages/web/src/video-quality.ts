export type VideoQuality = "data-saver" | "balanced" | "sharp";

export const VIDEO_QUALITY_STORAGE_KEY = "phone-monitor.videoQuality";

export const VIDEO_QUALITY_OPTIONS: Array<{
  value: VideoQuality;
  label: string;
}> = [
  { value: "data-saver", label: "Data saver" },
  { value: "balanced", label: "Balanced" },
  { value: "sharp", label: "Sharp" }
];

export type VideoQualityReader =
  | {
      getItem: (key: string) => string | null;
    }
  | {
      get: (key: string) => string | undefined;
    };

export type VideoQualityWriter = {
  setItem: (key: string, value: string) => void;
};

export function parseVideoQuality(
  value: string | null | undefined
): VideoQuality | undefined {
  if (value === "data-saver" || value === "balanced" || value === "sharp") {
    return value;
  }
  return undefined;
}

export function readVideoQuality(
  storage: VideoQualityReader | undefined
): VideoQuality {
  if (!storage) return "balanced";
  try {
    if ("getItem" in storage) {
      return parseVideoQuality(storage.getItem(VIDEO_QUALITY_STORAGE_KEY)) ?? "balanced";
    }
    return parseVideoQuality(storage.get(VIDEO_QUALITY_STORAGE_KEY)) ?? "balanced";
  } catch {
    return "balanced";
  }
}

export function saveVideoQuality(
  storage: VideoQualityWriter | undefined,
  value: VideoQuality
): void {
  try {
    storage?.setItem(VIDEO_QUALITY_STORAGE_KEY, value);
  } catch {
    // Blocked storage should not prevent monitoring from starting.
  }
}

export function browserVideoQualityStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function labelVideoQuality(value: VideoQuality): string {
  return VIDEO_QUALITY_OPTIONS.find((option) => option.value === value)?.label ?? "Balanced";
}

export function buildVideoSenderEncoding(
  value: VideoQuality
): Pick<RTCRtpEncodingParameters, "maxBitrate" | "maxFramerate"> {
  if (value === "data-saver") {
    return {
      maxBitrate: 450_000,
      maxFramerate: 15
    };
  }

  if (value === "sharp") {
    return {
      maxBitrate: 2_200_000,
      maxFramerate: 30
    };
  }

  return {
    maxBitrate: 1_400_000,
    maxFramerate: 24
  };
}

export async function configureVideoSender(
  sender: Pick<RTCRtpSender, "getParameters" | "setParameters">,
  value: VideoQuality
): Promise<void> {
  const parameters = sender.getParameters();
  const encodings = parameters.encodings?.length
    ? [...parameters.encodings]
    : [{} as RTCRtpEncodingParameters];
  encodings[0] = {
    ...encodings[0],
    ...buildVideoSenderEncoding(value)
  };

  const nextParameters = {
    ...parameters,
    degradationPreference: "maintain-framerate",
    encodings
  } as RTCRtpSendParameters;

  await sender.setParameters(nextParameters);
}

export function buildVideoConstraints(value: VideoQuality): MediaTrackConstraints {
  if (value === "data-saver") {
    return {
      facingMode: "environment",
      width: { ideal: 640, max: 854 },
      height: { ideal: 360, max: 480 },
      frameRate: { ideal: 15, max: 20 }
    };
  }

  if (value === "sharp") {
    return {
      facingMode: "environment",
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    };
  }

  return {
    facingMode: "environment",
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 20, max: 24 }
  };
}
