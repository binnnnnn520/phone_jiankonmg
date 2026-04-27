export interface ClientConfig {
  httpUrl: string;
  wsUrl: string;
  publicViewerUrl?: string;
}

export interface ClientEnv {
  VITE_SIGNALING_HTTP_URL?: string;
  VITE_SIGNALING_WS_URL?: string;
  VITE_PUBLIC_VIEWER_URL?: string;
}

function viteEnv(): ClientEnv {
  try {
    return {
      VITE_SIGNALING_HTTP_URL: import.meta.env.VITE_SIGNALING_HTTP_URL,
      VITE_SIGNALING_WS_URL: import.meta.env.VITE_SIGNALING_WS_URL,
      VITE_PUBLIC_VIEWER_URL: import.meta.env.VITE_PUBLIC_VIEWER_URL
    };
  } catch {
    return {};
  }
}

export function loadClientConfig(env: ClientEnv = viteEnv()): ClientConfig {
  const config: ClientConfig = {
    httpUrl: env.VITE_SIGNALING_HTTP_URL ?? "http://localhost:8787",
    wsUrl: env.VITE_SIGNALING_WS_URL ?? "ws://localhost:8787/ws"
  };
  if (env.VITE_PUBLIC_VIEWER_URL) {
    config.publicViewerUrl = env.VITE_PUBLIC_VIEWER_URL;
  }
  return config;
}
