import type { IceServerConfig } from "@phone-monitor/shared";

export interface ServerConfig {
  host: string;
  port: number;
  publicHttpUrl: string;
  roomTtlMs: number;
  pinMaxAttempts: number;
  iceServers: IceServerConfig[];
  pairStoreFile: string;
}

const DEFAULT_PORT = 8787;
const DEFAULT_ROOM_TTL_SECONDS = 600;
const DEFAULT_PIN_MAX_ATTEMPTS = 5;

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPort(value: string | undefined): number {
  const port = readPositiveInteger(value, DEFAULT_PORT);
  return port <= 65535 ? port : DEFAULT_PORT;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const port = readPort(env.SIGNALING_PORT);
  const roomTtlMs =
    readPositiveNumber(env.ROOM_TTL_SECONDS, DEFAULT_ROOM_TTL_SECONDS) * 1000;
  const pinMaxAttempts = readPositiveInteger(
    env.PIN_MAX_ATTEMPTS,
    DEFAULT_PIN_MAX_ATTEMPTS
  );
  const iceServers = JSON.parse(
    env.ICE_SERVERS_JSON ?? '[{"urls":"stun:stun.l.google.com:19302"}]'
  ) as IceServerConfig[];

  return {
    host: env.SIGNALING_HOST ?? "0.0.0.0",
    port,
    publicHttpUrl: env.PUBLIC_SIGNALING_HTTP_URL ?? `http://localhost:${port}`,
    roomTtlMs,
    pinMaxAttempts,
    iceServers,
    pairStoreFile: env.PAIR_STORE_FILE ?? "data/pairs.json"
  };
}
