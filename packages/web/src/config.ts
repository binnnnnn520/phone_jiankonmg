export interface ClientConfig {
  httpUrl: string;
  wsUrl: string;
}

export interface ClientEnv {
  VITE_SIGNALING_HTTP_URL?: string;
  VITE_SIGNALING_WS_URL?: string;
}

function viteEnv(): ClientEnv {
  const meta = import.meta as ImportMeta & { env?: ClientEnv };
  return meta.env ?? {};
}

export function loadClientConfig(env: ClientEnv = viteEnv()): ClientConfig {
  return {
    httpUrl: env.VITE_SIGNALING_HTTP_URL ?? "http://localhost:8787",
    wsUrl: env.VITE_SIGNALING_WS_URL ?? "ws://localhost:8787/ws"
  };
}
