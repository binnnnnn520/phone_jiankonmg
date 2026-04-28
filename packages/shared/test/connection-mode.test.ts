import assert from "node:assert/strict";
import test from "node:test";
import {
  labelConnectionFallback,
  labelConnectionMode
} from "../src/connection-mode.js";

test("labels nearby mode as same Wi-Fi", () => {
  assert.equal(labelConnectionMode("nearby"), "Same Wi-Fi");
});

test("labels remote mode without server wording", () => {
  assert.equal(labelConnectionMode("remote"), "Remote");
});

test("labels fallback without exposing signaling details", () => {
  assert.equal(labelConnectionFallback(false), "Checking connection");
  assert.equal(labelConnectionFallback(true), "Falling back to remote");
});
