import type { UserFacingConnectionState } from "./types.js";

export function mapIceStateToUserState(
  iceState: RTCIceConnectionState,
  relayActive: boolean
): UserFacingConnectionState {
  if (relayActive && iceState === "connected") return "Using relay connection";
  if (iceState === "connected" || iceState === "completed") return "Live";
  if (iceState === "checking" || iceState === "new") return "Connecting";
  if (iceState === "disconnected") return "Reconnecting";
  if (iceState === "closed") return "Session ended";
  return "Retry needed";
}
