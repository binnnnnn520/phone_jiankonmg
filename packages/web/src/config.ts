export interface ClientConfig {
  httpUrl: string;
  wsUrl: string;
  publicViewerUrl?: string;
  preferredConnectionMode: "nearby" | "remote" | "auto";
}

export interface ClientEnv {
  VITE_SIGNALING_HTTP_URL?: string;
  VITE_SIGNALING_WS_URL?: string;
  VITE_PUBLIC_VIEWER_URL?: string;
  VITE_PREFERRED_CONNECTION_MODE?: "nearby" | "remote" | "auto";
}

function viteEnv(): ClientEnv {
  try {
    return {
      VITE_SIGNALING_HTTP_URL: import.meta.env.VITE_SIGNALING_HTTP_URL,
      VITE_SIGNALING_WS_URL: import.meta.env.VITE_SIGNALING_WS_URL,
      VITE_PUBLIC_VIEWER_URL: import.meta.env.VITE_PUBLIC_VIEWER_URL,
      VITE_PREFERRED_CONNECTION_MODE:
        import.meta.env.VITE_PREFERRED_CONNECTION_MODE
    };
  } catch {
    return {};
  }
}

export function loadClientConfig(env: ClientEnv = viteEnv()): ClientConfig {
  const config: ClientConfig = {
    httpUrl: env.VITE_SIGNALING_HTTP_URL ?? "http://localhost:8787",
    wsUrl: env.VITE_SIGNALING_WS_URL ?? "ws://localhost:8787/ws",
    preferredConnectionMode: env.VITE_PREFERRED_CONNECTION_MODE ?? "auto"
  };
  if (env.VITE_PUBLIC_VIEWER_URL) {
    config.publicViewerUrl = env.VITE_PUBLIC_VIEWER_URL;
  }
  return config;
}
