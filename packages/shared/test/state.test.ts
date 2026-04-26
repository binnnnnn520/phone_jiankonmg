import assert from "node:assert/strict";
import test from "node:test";
import { mapIceStateToUserState } from "../src/state.js";

test("maps a connected direct WebRTC state to Live", () => {
  assert.equal(mapIceStateToUserState("connected", false), "Live");
});

test("maps a connected relayed WebRTC state to Using relay connection", () => {
  assert.equal(
    mapIceStateToUserState("connected", true),
    "Using relay connection"
  );
});

test("maps disconnected to Reconnecting", () => {
  assert.equal(mapIceStateToUserState("disconnected", false), "Reconnecting");
});
