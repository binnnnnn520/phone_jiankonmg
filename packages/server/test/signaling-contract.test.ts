import assert from "node:assert/strict";
import test from "node:test";
import type { SignalingMessage } from "@phone-monitor/shared";

test("offer message carries room ID and SDP", () => {
  const message: SignalingMessage = {
    type: "offer",
    roomId: "room-1",
    sdp: { type: "offer", sdp: "v=0\r\n" }
  };

  assert.equal(message.type, "offer");
  assert.equal(message.sdp.type, "offer");
});

test("viewer join message carries an admission token", () => {
  const message: SignalingMessage = {
    type: "join-viewer",
    roomId: "room-1",
    viewerToken: "viewer-token"
  };

  assert.equal(message.viewerToken, "viewer-token");
});
