import type { SignalingMessage } from "@phone-monitor/shared";

export interface BrowserSocket {
  readonly readyState: number;
  addEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void;
  close: () => void;
  send: (message: string) => void;
}

export type SignalingMessageListener = (message: SignalingMessage) => void;

export interface SignalingClientLike {
  connect: () => Promise<void>;
  onMessage: (listener: SignalingMessageListener) => () => void;
  send: (message: SignalingMessage) => void;
  close: () => void;
}

export type BrowserSocketFactory = (url: string) => BrowserSocket;

const SOCKET_OPEN = 1;

export class SignalingClient implements SignalingClientLike {
  private socket?: BrowserSocket;
  private readonly listeners = new Set<SignalingMessageListener>();

  constructor(
    private readonly wsUrl: string,
    private readonly createSocket: BrowserSocketFactory = (url) => new WebSocket(url)
  ) {}

  connect(): Promise<void> {
    this.socket = this.createSocket(this.wsUrl);
    this.socket.addEventListener("message", (event) => {
      const messageEvent = event as MessageEvent<string>;
      const message = JSON.parse(messageEvent.data) as SignalingMessage;
      for (const listener of this.listeners) listener(message);
    });

    return new Promise((resolve, reject) => {
      this.socket?.addEventListener("open", () => resolve(), { once: true });
      this.socket?.addEventListener(
        "error",
        () => reject(new Error("Signaling connection failed")),
        { once: true }
      );
    });
  }

  onMessage(listener: SignalingMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(message: SignalingMessage): void {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) {
      throw new Error("Signaling socket is not open");
    }
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket?.close();
  }
}
