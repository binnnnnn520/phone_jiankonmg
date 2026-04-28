import assert from "node:assert/strict";
import test from "node:test";
import {
  CONNECTION_MODE_STORAGE_KEY,
  chooseConnectionMode,
  fallbackToRemote,
  parseConnectionMode,
  resolvePreferredConnectionMode
} from "../src/connection-mode.js";

test("auto mode defaults to implemented remote behavior", () => {
  assert.deepEqual(chooseConnectionMode({ preferredConnectionMode: "auto" }), {
    mode: "remote",
    label: "Remote",
    usesHostedSignaling: true
  });
});

test("remote mode uses hosted signaling without saying server", () => {
  assert.deepEqual(chooseConnectionMode({ preferredConnectionMode: "remote" }), {
    mode: "remote",
    label: "Remote",
    usesHostedSignaling: true
  });
});

test("fallback switches to remote mode", () => {
  assert.deepEqual(fallbackToRemote(), {
    mode: "remote",
    label: "Remote",
    usesHostedSignaling: true
  });
});

test("connection mode parsing accepts only selectable modes", () => {
  assert.equal(parseConnectionMode("nearby"), "nearby");
  assert.equal(parseConnectionMode("remote"), "remote");
  assert.equal(parseConnectionMode("auto"), undefined);
  assert.equal(parseConnectionMode(""), undefined);
});

test("query connection mode overrides stored and configured mode", () => {
  const storage = new Map([[CONNECTION_MODE_STORAGE_KEY, "remote"]]);

  assert.equal(
    resolvePreferredConnectionMode({
      params: new URLSearchParams("connection=nearby"),
      storage,
      configuredMode: "remote"
    }),
    "nearby"
  );
});

test("stored connection mode is used when the route has no override", () => {
  const storage = new Map([[CONNECTION_MODE_STORAGE_KEY, "nearby"]]);

  assert.equal(
    resolvePreferredConnectionMode({
      params: new URLSearchParams(),
      storage,
      configuredMode: "auto"
    }),
    "nearby"
  );
});
