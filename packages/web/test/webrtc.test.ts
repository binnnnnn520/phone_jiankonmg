import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRemotePeerSignal,
  detectRelayFromStats
} from "../src/webrtc.js";

type WebRtcModule = typeof import("../src/webrtc.js") & {
  flushQueuedIceCandidates?: (peer: RTCPeerConnection) => Promise<void>;
};

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

test("applyRemotePeerSignal queues ICE candidates until an answer sets the remote description", async () => {
  const calls: string[] = [];
  let remoteDescription: RTCSessionDescriptionInit | null = null;
  const peer = {
    get remoteDescription() {
      return remoteDescription;
    },
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
      calls.push(`set-remote:${description.type}`);
      remoteDescription = description;
    },
    async addIceCandidate(candidate: RTCIceCandidateInit) {
      calls.push(`add-candidate:${candidate.candidate}`);
    }
  } as unknown as RTCPeerConnection;

  const candidateApplied = applyRemotePeerSignal(peer, {
    type: "ice-candidate",
    roomId: "room-1",
    candidate: { candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host" }
  });
  await Promise.resolve();

  assert.deepEqual(calls, []);

  await applyRemotePeerSignal(peer, {
    type: "answer",
    roomId: "room-1",
    sdp: { type: "answer", sdp: "v=0\r\n" }
  });
  await candidateApplied;

  assert.deepEqual(calls, [
    "set-remote:answer",
    "add-candidate:candidate:1 1 UDP 1 127.0.0.1 9 typ host"
  ]);
});

test("queued ICE candidates can be flushed after a viewer applies a remote offer", async () => {
  const webrtc = (await import("../src/webrtc.js")) as WebRtcModule;
  assert.equal(typeof webrtc.flushQueuedIceCandidates, "function");

  const calls: string[] = [];
  let remoteDescription: RTCSessionDescriptionInit | null = null;
  const peer = {
    get remoteDescription() {
      return remoteDescription;
    },
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
      calls.push(`set-remote:${description.type}`);
      remoteDescription = description;
    },
    async addIceCandidate(candidate: RTCIceCandidateInit) {
      calls.push(`add-candidate:${candidate.candidate}`);
    }
  } as unknown as RTCPeerConnection;

  const candidateApplied = applyRemotePeerSignal(peer, {
    type: "ice-candidate",
    roomId: "room-1",
    candidate: { candidate: "candidate:2 1 UDP 1 127.0.0.1 9 typ host" }
  });
  await Promise.resolve();

  assert.deepEqual(calls, []);

  await peer.setRemoteDescription({ type: "offer", sdp: "v=0\r\n" });
  await webrtc.flushQueuedIceCandidates!(peer);
  await candidateApplied;

  assert.deepEqual(calls, [
    "set-remote:offer",
    "add-candidate:candidate:2 1 UDP 1 127.0.0.1 9 typ host"
  ]);
});

test("queued ICE candidate errors reject through the original apply promise", async () => {
  let remoteDescription: RTCSessionDescriptionInit | null = null;
  const peer = {
    get remoteDescription() {
      return remoteDescription;
    },
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
      remoteDescription = description;
    },
    async addIceCandidate() {
      throw new Error("bad candidate");
    }
  } as unknown as RTCPeerConnection;

  const candidateApplied = applyRemotePeerSignal(peer, {
    type: "ice-candidate",
    roomId: "room-1",
    candidate: { candidate: "candidate:3 1 UDP 1 127.0.0.1 9 typ host" }
  });

  await applyRemotePeerSignal(peer, {
    type: "answer",
    roomId: "room-1",
    sdp: { type: "answer", sdp: "v=0\r\n" }
  });

  await assert.rejects(candidateApplied, /bad candidate/);
});
