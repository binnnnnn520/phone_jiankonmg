import assert from "node:assert/strict";
import test from "node:test";
import { loadClientConfig } from "../src/config.js";

test("loadClientConfig uses localhost signaling defaults", () => {
  assert.deepEqual(loadClientConfig({}), {
    httpUrl: "http://localhost:8787",
    wsUrl: "ws://localhost:8787/ws"
  });
});

test("loadClientConfig accepts Vite-provided signaling URLs", () => {
  assert.deepEqual(
    loadClientConfig({
      VITE_SIGNALING_HTTP_URL: "https://signal.example",
      VITE_SIGNALING_WS_URL: "wss://signal.example/ws"
    }),
    {
      httpUrl: "https://signal.example",
      wsUrl: "wss://signal.example/ws"
    }
  );
});
