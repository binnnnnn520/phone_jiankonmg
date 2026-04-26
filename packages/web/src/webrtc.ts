import type {
  IceServerConfig,
  SignalingMessage,
  UserFacingConnectionState
} from "@phone-monitor/shared";
import { mapIceStateToUserState } from "@phone-monitor/shared/state";
import type { SignalingClientLike } from "./signaling-client.js";

export interface PeerController {
  peer: RTCPeerConnection;
  close: () => void;
}

export interface CreatePeerParams {
  iceServers: IceServerConfig[];
  signaling: SignalingClientLike;
  roomId: string;
  onState: (state: UserFacingConnectionState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

interface CandidatePairStats {
  localCandidateId?: string;
  nominated?: boolean;
  selected?: boolean;
  state?: string;
  type?: string;
}

interface LocalCandidateStats {
  candidateType?: string;
  type?: string;
}

interface QueuedIceCandidate {
  candidate: RTCIceCandidateInit;
  resolve: () => void;
  reject: (error: unknown) => void;
}

type StatsReportLike = Iterable<[string, RTCStats]> & {
  get?: (id: string) => RTCStats | undefined;
};

const queuedIceCandidates = new WeakMap<RTCPeerConnection, QueuedIceCandidate[]>();

function isSelectedPair(stat: CandidatePairStats): boolean {
  return stat.type === "candidate-pair" && (stat.selected === true || stat.nominated === true || stat.state === "succeeded");
}

function getStat(stats: StatsReportLike, id: string): RTCStats | undefined {
  if (typeof stats.get === "function") return stats.get(id);

  for (const [entryId, stat] of stats) {
    if (entryId === id) return stat;
  }
  return undefined;
}

export function detectRelayFromStats(stats: StatsReportLike): boolean {
  for (const [, stat] of stats) {
    const pair = stat as CandidatePairStats;
    if (!isSelectedPair(pair) || !pair.localCandidateId) continue;

    const local = getStat(stats, pair.localCandidateId);
    if ((local as LocalCandidateStats | undefined)?.candidateType === "relay") {
      return true;
    }
  }

  return false;
}

export function createPeer(params: CreatePeerParams): PeerController {
  const peer = new RTCPeerConnection({ iceServers: params.iceServers });
  let relayActive = false;

  async function updateState(): Promise<void> {
    try {
      relayActive = detectRelayFromStats(await peer.getStats());
    } catch {
      relayActive = false;
    }
    params.onState(mapIceStateToUserState(peer.iceConnectionState, relayActive));
  }

  peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      params.signaling.send({
        type: "ice-candidate",
        roomId: params.roomId,
        candidate: event.candidate.toJSON()
      });
    }
  });

  peer.addEventListener("iceconnectionstatechange", () => {
    void updateState();
  });

  peer.addEventListener("track", (event) => {
    const [stream] = event.streams;
    if (stream) params.onRemoteStream?.(stream);
  });

  const unsubscribe = params.signaling.onMessage((message) => {
    void applyRemotePeerSignal(peer, message).catch(() => {
      params.onState("Retry needed");
    });
  });

  return {
    peer,
    close: () => {
      rejectQueuedIceCandidates(peer, new Error("Peer connection closed"));
      unsubscribe();
      peer.close();
    }
  };
}

function hasRemoteDescription(peer: RTCPeerConnection): boolean {
  return peer.remoteDescription != null || peer.currentRemoteDescription != null;
}

function queueIceCandidate(
  peer: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  return new Promise((resolve, reject) => {
    const queue = queuedIceCandidates.get(peer) ?? [];
    queue.push({ candidate, resolve, reject });
    queuedIceCandidates.set(peer, queue);
  });
}

async function addIceCandidateWhenReady(
  peer: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  if (!hasRemoteDescription(peer)) {
    return queueIceCandidate(peer, candidate);
  }
  await peer.addIceCandidate(candidate);
}

export async function flushQueuedIceCandidates(
  peer: RTCPeerConnection
): Promise<void> {
  if (!hasRemoteDescription(peer)) return;

  const queue = queuedIceCandidates.get(peer);
  if (!queue?.length) return;
  queuedIceCandidates.delete(peer);

  for (const entry of queue) {
    try {
      await peer.addIceCandidate(entry.candidate);
      entry.resolve();
    } catch (error) {
      entry.reject(error);
    }
  }
}

function rejectQueuedIceCandidates(
  peer: RTCPeerConnection,
  error: unknown
): void {
  const queue = queuedIceCandidates.get(peer);
  if (!queue?.length) return;
  queuedIceCandidates.delete(peer);
  for (const entry of queue) {
    entry.reject(error);
  }
}

export async function applyRemotePeerSignal(
  peer: RTCPeerConnection,
  message: SignalingMessage
): Promise<void> {
  if (message.type === "answer") {
    await peer.setRemoteDescription(message.sdp);
    await flushQueuedIceCandidates(peer);
  }
  if (message.type === "ice-candidate") {
    await addIceCandidateWhenReady(peer, message.candidate);
  }
}
