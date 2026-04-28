import type {
  CreateRoomRequest,
  CreateRoomResponse,
  PairReconnectResponse,
  PairStatusResponse,
  ViewerPairedCamera,
  VerifyPinResponse
} from "@phone-monitor/shared";
import type { ClientConfig } from "./config.js";

type FetchLike = typeof fetch;

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { code?: string };
    return body.code;
  } catch {
    return undefined;
  }
}

export async function createRoom(
  config: ClientConfig,
  fetcher: FetchLike = fetch,
  request: CreateRoomRequest = {}
): Promise<CreateRoomResponse> {
  const response = await fetcher(`${config.httpUrl}/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error("Could not create monitoring room");
  return response.json() as Promise<CreateRoomResponse>;
}

export async function verifyPin(
  config: ClientConfig,
  roomId: string,
  pin: string,
  fetcher: FetchLike = fetch,
  pairing: { viewerDeviceId?: string; displayName?: string } = {}
): Promise<VerifyPinResponse> {
  const response = await fetcher(`${config.httpUrl}/rooms/verify-pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, pin, ...pairing })
  });

  if (!response.ok) {
    throw new Error((await readErrorCode(response)) ?? "PIN verification failed");
  }

  return response.json() as Promise<VerifyPinResponse>;
}

export async function reconnectPair(
  config: ClientConfig,
  pairedCamera: ViewerPairedCamera,
  fetcher: FetchLike = fetch
): Promise<PairReconnectResponse> {
  const response = await fetcher(`${config.httpUrl}/pairs/reconnect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pairRequestBody(pairedCamera))
  });

  if (!response.ok) {
    throw new Error((await readErrorCode(response)) ?? "Could not reconnect");
  }

  return response.json() as Promise<PairReconnectResponse>;
}

export async function getPairStatus(
  config: ClientConfig,
  pairedCamera: ViewerPairedCamera,
  fetcher: FetchLike = fetch
): Promise<PairStatusResponse> {
  const response = await fetcher(`${config.httpUrl}/pairs/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pairRequestBody(pairedCamera))
  });

  if (!response.ok) {
    throw new Error((await readErrorCode(response)) ?? "Could not check camera");
  }

  return response.json() as Promise<PairStatusResponse>;
}

function pairRequestBody(pairedCamera: ViewerPairedCamera): {
  pairId: string;
  viewerDeviceId: string;
  viewerPairToken: string;
} {
  return {
    pairId: pairedCamera.pairId,
    viewerDeviceId: pairedCamera.viewerDeviceId,
    viewerPairToken: pairedCamera.viewerPairToken
  };
}
