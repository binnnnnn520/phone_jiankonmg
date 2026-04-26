import {
  type IceServerConfig,
  type SignalingMessage,
  type UserFacingConnectionState
} from "@phone-monitor/shared";
import { mapIceStateToUserState } from "@phone-monitor/shared/dist/src/state.js";
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

type StatsReportLike = Iterable<[string, RTCStats]> & {
  get?: (id: string) => RTCStats | undefined;
};

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
    void applyRemotePeerSignal(peer, message);
  });

  return {
    peer,
    close: () => {
      unsubscribe();
      peer.close();
    }
  };
}

export async function applyRemotePeerSignal(
  peer: RTCPeerConnection,
  message: SignalingMessage
): Promise<void> {
  if (message.type === "answer") {
    await peer.setRemoteDescription(message.sdp);
  }
  if (message.type === "ice-candidate") {
    await peer.addIceCandidate(message.candidate);
  }
}
