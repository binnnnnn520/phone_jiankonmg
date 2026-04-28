import type { ConnectionMode } from "@phone-monitor/shared";
import { labelConnectionMode } from "@phone-monitor/shared/connection-mode";
import type { ClientConfig } from "./config.js";

export const CONNECTION_MODE_STORAGE_KEY = "phone-monitor.connectionMode";

type ConnectionModeReader =
  | {
      getItem: (key: string) => string | null;
    }
  | {
      get: (key: string) => string | undefined;
    };

type ConnectionModeWriter = {
  setItem: (key: string, value: string) => void;
};

export interface ConnectionModeDecision {
  mode: ConnectionMode;
  label: string;
  usesHostedSignaling: boolean;
}

export function parseConnectionMode(
  value: string | null | undefined
): ConnectionMode | undefined {
  if (value === "nearby" || value === "remote") return value;
  return undefined;
}

function readConnectionMode(
  storage: ConnectionModeReader | undefined
): ConnectionMode | undefined {
  if (!storage) return undefined;
  try {
    if ("getItem" in storage) {
      return parseConnectionMode(storage.getItem(CONNECTION_MODE_STORAGE_KEY));
    }
    return parseConnectionMode(storage.get(CONNECTION_MODE_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function resolvePreferredConnectionMode(options: {
  params?: URLSearchParams | undefined;
  storage?: ConnectionModeReader | undefined;
  configuredMode?: ClientConfig["preferredConnectionMode"] | undefined;
}): ConnectionMode {
  return (
    parseConnectionMode(options.params?.get("connection")) ??
    readConnectionMode(options.storage) ??
    parseConnectionMode(options.configuredMode) ??
    "remote"
  );
}

export function storeConnectionMode(
  storage: ConnectionModeWriter | undefined,
  mode: ConnectionMode
): void {
  try {
    storage?.setItem(CONNECTION_MODE_STORAGE_KEY, mode);
  } catch {
    // A blocked storage write should not prevent navigation.
  }
}

export function browserConnectionModeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function chooseConnectionMode(
  config: Pick<ClientConfig, "preferredConnectionMode">
): ConnectionModeDecision {
  const mode: ConnectionMode =
    config.preferredConnectionMode === "nearby" ? "nearby" : "remote";

  return {
    mode,
    label: labelConnectionMode(mode),
    usesHostedSignaling: mode === "remote"
  };
}

export function fallbackToRemote(): ConnectionModeDecision {
  return {
    mode: "remote",
    label: labelConnectionMode("remote"),
    usesHostedSignaling: true
  };
}
