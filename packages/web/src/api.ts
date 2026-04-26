import type {
  CreateRoomResponse,
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
  fetcher: FetchLike = fetch
): Promise<CreateRoomResponse> {
  const response = await fetcher(`${config.httpUrl}/rooms`, { method: "POST" });
  if (!response.ok) throw new Error("Could not create monitoring room");
  return response.json() as Promise<CreateRoomResponse>;
}

export async function verifyPin(
  config: ClientConfig,
  roomId: string,
  pin: string,
  fetcher: FetchLike = fetch
): Promise<VerifyPinResponse> {
  const response = await fetcher(`${config.httpUrl}/rooms/verify-pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, pin })
  });

  if (!response.ok) {
    throw new Error((await readErrorCode(response)) ?? "PIN verification failed");
  }

  return response.json() as Promise<VerifyPinResponse>;
}
