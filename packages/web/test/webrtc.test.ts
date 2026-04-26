import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRemotePeerSignal,
  detectRelayFromStats
} from "../src/webrtc.js";

test("detectRelayFromStats identifies selected relay candidate pairs", () => {
  const stats = new Map<string, RTCStats>([
    [
      "pair-1",
      {
        id: "pair-1",
        timestamp: 1,
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1"
      } as RTCStats
    ],
    [
      "local-1",
      {
        id: "local-1",
        timestamp: 1,
        type: "local-candidate",
        candidateType: "relay"
      } as RTCStats
    ]
  ]);

  assert.equal(detectRelayFromStats(stats), true);
});

test("detectRelayFromStats ignores direct selected candidate pairs", () => {
  const stats = new Map<string, RTCStats>([
    [
      "pair-1",
      {
        id: "pair-1",
        timestamp: 1,
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1"
      } as RTCStats
    ],
    [
      "local-1",
      {
        id: "local-1",
        timestamp: 1,
        type: "local-candidate",
        candidateType: "host"
      } as RTCStats
    ]
  ]);

  assert.equal(detectRelayFromStats(stats), false);
});

test("detectRelayFromStats supports RTCStatsReport-style get lookups", () => {
  const entries: Array<[string, RTCStats]> = [
    [
      "pair-1",
      {
        id: "pair-1",
        timestamp: 1,
        type: "candidate-pair",
        selected: true,
        localCandidateId: "local-1"
      } as RTCStats
    ],
    [
      "local-1",
      {
        id: "local-1",
        timestamp: 1,
        type: "local-candidate",
        candidateType: "relay"
      } as RTCStats
    ]
  ];
  const stats = {
    [Symbol.iterator]: function* () {
      yield* entries;
    },
    get: (id: string) => entries.find(([entryId]) => entryId === id)?.[1]
  };

  assert.equal(detectRelayFromStats(stats), true);
});

test("applyRemotePeerSignal ignores offers so viewers can answer them", async () => {
  const calls: string[] = [];
  const peer = {
    async setRemoteDescription() {
      calls.push("set-remote-description");
    },
    async addIceCandidate() {
      calls.push("add-ice-candidate");
    }
  } as unknown as RTCPeerConnection;

  await applyRemotePeerSignal(peer, {
    type: "offer",
    roomId: "room-1",
    sdp: { type: "offer", sdp: "v=0\r\n" }
  });

  assert.deepEqual(calls, []);
});
