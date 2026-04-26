import assert from "node:assert/strict";
import test from "node:test";
import { mapIceStateToUserState } from "../src/state.js";

test("maps a connected direct WebRTC state to Live", () => {
  assert.equal(mapIceStateToUserState("connected", false), "Live");
});

test("maps completed to Live", () => {
  assert.equal(mapIceStateToUserState("completed", false), "Live");
});

test("maps a connected relayed WebRTC state to Using relay connection", () => {
  assert.equal(
    mapIceStateToUserState("connected", true),
    "Using relay connection"
  );
});

test("maps checking and new to Connecting", () => {
  assert.equal(mapIceStateToUserState("checking", false), "Connecting");
  assert.equal(mapIceStateToUserState("new", false), "Connecting");
});

test("maps disconnected to Reconnecting", () => {
  assert.equal(mapIceStateToUserState("disconnected", false), "Reconnecting");
});

test("maps closed to Session ended", () => {
  assert.equal(mapIceStateToUserState("closed", false), "Session ended");
});

test("maps failed to Retry needed", () => {
  assert.equal(mapIceStateToUserState("failed", false), "Retry needed");
});
