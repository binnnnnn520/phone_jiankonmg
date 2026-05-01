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

interface VideoSdpBitrateHints {
  startBitrateKbps: number;
  maxBitrateKbps: number;
  minBitrateKbps: number;
}

function buildVideoSdpBitrateHints(value: VideoQuality): VideoSdpBitrateHints {
  if (value === "data-saver") {
    return {
      startBitrateKbps: 350,
      maxBitrateKbps: 450,
      minBitrateKbps: 150
    };
  }

  if (value === "sharp") {
    return {
      startBitrateKbps: 1800,
      maxBitrateKbps: 2200,
      minBitrateKbps: 600
    };
  }

  return {
    startBitrateKbps: 1000,
    maxBitrateKbps: 1400,
    minBitrateKbps: 400
  };
}

function formatVideoBitrateParameters(
  parameters: string | undefined,
  hints: VideoSdpBitrateHints
): string {
  const nextParameters = (parameters ?? "")
    .split(";")
    .map((parameter) => parameter.trim())
    .filter(
      (parameter) =>
        parameter &&
        !parameter.startsWith("x-google-start-bitrate=") &&
        !parameter.startsWith("x-google-max-bitrate=") &&
        !parameter.startsWith("x-google-min-bitrate=")
    );

  nextParameters.push(
    `x-google-start-bitrate=${hints.startBitrateKbps}`,
    `x-google-max-bitrate=${hints.maxBitrateKbps}`,
    `x-google-min-bitrate=${hints.minBitrateKbps}`
  );

  return nextParameters.join(";");
}

function tuneVideoFmtpLine(
  line: string,
  hints: VideoSdpBitrateHints
): string {
  const match = /^a=fmtp:(\d+)(?:\s+(.*))?$/i.exec(line);
  if (!match) return line;
  const payloadType = match[1];
  if (!payloadType) return line;

  return `a=fmtp:${payloadType} ${formatVideoBitrateParameters(match[2], hints)}`;
}

function tuneVideoSdpSection(
  section: string[],
  hints: VideoSdpBitrateHints
): string[] {
  const mediaPayloadTypes = new Set(section[0]?.split(/\s+/).slice(3) ?? []);
  const videoPayloadTypes = new Set<string>();
  const existingFmtpPayloadTypes = new Set<string>();

  for (const line of section) {
    const rtpMap = /^a=rtpmap:(\d+)\s+([^/\s]+)/i.exec(line);
    const rtpMapPayloadType = rtpMap?.[1];
    const rtpMapCodec = rtpMap?.[2];
    if (
      rtpMapPayloadType &&
      rtpMapCodec &&
      mediaPayloadTypes.has(rtpMapPayloadType)
    ) {
      const codec = rtpMapCodec.toLowerCase();
      if (!["rtx", "red", "ulpfec", "flexfec-03"].includes(codec)) {
        videoPayloadTypes.add(rtpMapPayloadType);
      }
    }

    const fmtp = /^a=fmtp:(\d+)(?:\s|$)/i.exec(line);
    const fmtpPayloadType = fmtp?.[1];
    if (fmtpPayloadType) existingFmtpPayloadTypes.add(fmtpPayloadType);
  }

  const sectionWithoutBandwidth = section.filter(
    (line) => !/^b=(AS|TIAS):/i.test(line)
  );
  const bandwidthInsertIndex =
    sectionWithoutBandwidth.findIndex((line) => line.startsWith("c=")) + 1 || 1;
  const withBandwidth = [...sectionWithoutBandwidth];
  withBandwidth.splice(
    bandwidthInsertIndex,
    0,
    `b=AS:${hints.maxBitrateKbps}`,
    `b=TIAS:${hints.maxBitrateKbps * 1000}`
  );

  const tuned: string[] = [];
  for (const line of withBandwidth) {
    const fmtp = /^a=fmtp:(\d+)(?:\s|$)/i.exec(line);
    const fmtpPayloadType = fmtp?.[1];
    if (fmtpPayloadType && videoPayloadTypes.has(fmtpPayloadType)) {
      tuned.push(tuneVideoFmtpLine(line, hints));
      continue;
    }

    tuned.push(line);

    const rtpMap = /^a=rtpmap:(\d+)\s+/i.exec(line);
    const rtpMapPayloadType = rtpMap?.[1];
    if (
      rtpMapPayloadType &&
      videoPayloadTypes.has(rtpMapPayloadType) &&
      !existingFmtpPayloadTypes.has(rtpMapPayloadType)
    ) {
      tuned.push(
        `a=fmtp:${rtpMapPayloadType} ${formatVideoBitrateParameters(undefined, hints)}`
      );
    }
  }

  return tuned;
}

function tuneVideoSdp(sdp: string, hints: VideoSdpBitrateHints): string {
  const newline = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r\n|\n/);
  const tuned: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    if (!line.startsWith("m=")) {
      tuned.push(line);
      index += 1;
      continue;
    }

    let nextSectionIndex = index + 1;
    while (
      nextSectionIndex < lines.length &&
      lines[nextSectionIndex]?.startsWith("m=") !== true
    ) {
      nextSectionIndex += 1;
    }

    const section = lines.slice(index, nextSectionIndex);
    tuned.push(
      ...(line.startsWith("m=video ")
        ? tuneVideoSdpSection(section, hints)
        : section)
    );
    index = nextSectionIndex;
  }

  return tuned.join(newline);
}

export function applyVideoSdpBitrateHints(
  description: RTCSessionDescriptionInit,
  value: VideoQuality
): RTCSessionDescriptionInit {
  if (description.type !== "offer" || !description.sdp) return description;

  return {
    ...description,
    sdp: tuneVideoSdp(description.sdp, buildVideoSdpBitrateHints(value))
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
    degradationPreference: "balanced",
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
