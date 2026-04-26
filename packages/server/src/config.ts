import type { IceServerConfig } from "@phone-monitor/shared";

export interface ServerConfig {
  host: string;
  port: number;
  publicHttpUrl: string;
  roomTtlMs: number;
  pinMaxAttempts: number;
  iceServers: IceServerConfig[];
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const port = Number(env.SIGNALING_PORT ?? "8787");
  const roomTtlMs = Number(env.ROOM_TTL_SECONDS ?? "600") * 1000;
  const pinMaxAttempts = Number(env.PIN_MAX_ATTEMPTS ?? "5");
  const iceServers = JSON.parse(
    env.ICE_SERVERS_JSON ?? '[{"urls":"stun:stun.l.google.com:19302"}]'
  ) as IceServerConfig[];

  return {
    host: env.SIGNALING_HOST ?? "0.0.0.0",
    port,
    publicHttpUrl: env.PUBLIC_SIGNALING_HTTP_URL ?? `http://localhost:${port}`,
    roomTtlMs,
    pinMaxAttempts,
    iceServers
  };
}
