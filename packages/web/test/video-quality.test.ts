import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_QUALITY_STORAGE_KEY,
  buildVideoSenderEncoding,
  buildVideoConstraints,
  configureVideoSender,
  applyVideoSdpBitrateHints,
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
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 20, max: 24 }
  });
});

test("sharp maps to higher but bounded camera constraints", () => {
  assert.deepEqual(buildVideoConstraints("sharp"), {
    facingMode: "environment",
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 24, max: 30 }
  });
});

test("video sender encoding is capped for low latency", () => {
  assert.deepEqual(buildVideoSenderEncoding("data-saver"), {
    maxBitrate: 450_000,
    maxFramerate: 15
  });
  assert.deepEqual(buildVideoSenderEncoding("balanced"), {
    maxBitrate: 1_400_000,
    maxFramerate: 24
  });
  assert.deepEqual(buildVideoSenderEncoding("sharp"), {
    maxBitrate: 2_200_000,
    maxFramerate: 30
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
    maxBitrate: 1_400_000,
    maxFramerate: 24
  });
  assert.equal(calls[0]?.degradationPreference, "balanced");
});

test("video SDP offer is seeded with startup bitrate hints", () => {
  const offer: RTCSessionDescriptionInit = {
    type: "offer",
    sdp: [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
      "m=video 9 UDP/TLS/RTP/SAVPF 96 97 103 104",
      "c=IN IP4 0.0.0.0",
      "a=rtpmap:96 VP8/90000",
      "a=rtpmap:97 rtx/90000",
      "a=fmtp:97 apt=96",
      "a=rtpmap:103 H264/90000",
      "a=fmtp:103 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
      "a=rtpmap:104 rtx/90000",
      "a=fmtp:104 apt=103",
      ""
    ].join("\r\n")
  };

  const tunedOffer = applyVideoSdpBitrateHints(offer, "balanced");

  assert.equal(tunedOffer.type, "offer");
  assert.match(tunedOffer.sdp ?? "", /b=AS:1400/);
  assert.match(
    tunedOffer.sdp ?? "",
    /a=fmtp:96 x-google-start-bitrate=1000;x-google-max-bitrate=1400;x-google-min-bitrate=400/
  );
  assert.match(
    tunedOffer.sdp ?? "",
    /a=fmtp:103 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f;x-google-start-bitrate=1000;x-google-max-bitrate=1400;x-google-min-bitrate=400/
  );
  assert.match(tunedOffer.sdp ?? "", /a=fmtp:97 apt=96/);
  assert.doesNotMatch(tunedOffer.sdp ?? "", /a=fmtp:111 .*x-google/);
});

test("video SDP bitrate hints leave answers without SDP unchanged", () => {
  const answer: RTCSessionDescriptionInit = {
    type: "answer"
  };

  assert.deepEqual(applyVideoSdpBitrateHints(answer, "balanced"), answer);
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
