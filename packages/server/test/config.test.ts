import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("falls back to sane defaults for invalid numeric environment values", () => {
  const config = loadConfig({
    SIGNALING_PORT: "0",
    ROOM_TTL_SECONDS: "NaN",
    PIN_MAX_ATTEMPTS: "-3"
  } as NodeJS.ProcessEnv);

  assert.equal(config.port, 8787);
  assert.equal(config.publicHttpUrl, "http://localhost:8787");
  assert.equal(config.roomTtlMs, 600000);
  assert.equal(config.pinMaxAttempts, 5);
  assert.equal(config.pairStoreFile, "data/pairs.json");
});
