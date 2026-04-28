import type { ConnectionMode, ConnectionModeLabel } from "./types.js";

export function labelConnectionMode(mode: ConnectionMode): ConnectionModeLabel {
  return mode === "nearby" ? "Same Wi-Fi" : "Remote";
}

export function labelConnectionFallback(
  fallbackActive: boolean
): ConnectionModeLabel {
  return fallbackActive ? "Falling back to remote" : "Checking connection";
}
