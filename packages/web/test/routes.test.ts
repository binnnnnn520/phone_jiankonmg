import assert from "node:assert/strict";
import test from "node:test";
import { resolveRoute } from "../src/routes.js";

test("resolveRoute opens camera mode only when requested", () => {
  assert.equal(resolveRoute(new URLSearchParams("mode=camera")), "camera");
});

test("resolveRoute opens viewer mode for direct viewer or QR room links", () => {
  assert.equal(resolveRoute(new URLSearchParams("mode=viewer")), "viewer");
  assert.equal(resolveRoute(new URLSearchParams("room=abc123")), "viewer");
});

test("resolveRoute falls back to home", () => {
  assert.equal(resolveRoute(new URLSearchParams()), "home");
});
