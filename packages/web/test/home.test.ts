import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeMarkup } from "../src/home.js";

test("home screen presents the two-phone approved UI copy", () => {
  const markup = buildHomeMarkup();

  assert.match(markup, /Two phones, live view/);
  assert.match(markup, /Use this phone as camera/);
  assert.match(markup, /Watch a camera/);
  assert.match(markup, /Same Wi-Fi/);
  assert.match(markup, /Remote/);
});

test("home screen marks remote as the current implemented connection mode", () => {
  const markup = buildHomeMarkup();

  assert.match(markup, /class="mode-option mode-option-selected"[^>]*>Remote<\/button>/);
  assert.doesNotMatch(markup, /class="mode-option mode-option-selected"[^>]*>Same Wi-Fi<\/button>/);
});

test("home screen can render same Wi-Fi as the selected connection mode", () => {
  const markup = buildHomeMarkup("nearby");

  assert.match(markup, /data-connection-mode="nearby"/);
  assert.match(markup, /data-connection-mode="remote"/);
  assert.match(markup, /class="mode-option mode-option-selected"[^>]*>Same Wi-Fi<\/button>/);
  assert.match(markup, /aria-pressed="true"[^>]*>Same Wi-Fi<\/button>/);
});

test("home screen renders clickable bottom navigation tabs", () => {
  const markup = buildHomeMarkup();

  assert.match(markup, /<button class="bottom-nav-item active"[^>]*data-home-tab="home"[^>]*>Home<\/button>/);
  assert.match(markup, /<button class="bottom-nav-item"[^>]*data-home-tab="cameras"[^>]*>Cameras<\/button>/);
  assert.match(markup, /<button class="bottom-nav-item"[^>]*data-home-tab="me"[^>]*>Me<\/button>/);
});

test("home screen can render cameras and me tabs as active", () => {
  const camerasMarkup = buildHomeMarkup("remote", "cameras");
  const meMarkup = buildHomeMarkup("remote", "me");

  assert.match(camerasMarkup, /class="bottom-nav-item active"[^>]*data-home-tab="cameras"[^>]*>Cameras<\/button>/);
  assert.match(camerasMarkup, /<h1>Cameras<\/h1>/);
  assert.match(meMarkup, /class="bottom-nav-item active"[^>]*data-home-tab="me"[^>]*>Me<\/button>/);
  assert.match(meMarkup, /<h1>Me<\/h1>/);
});

test("cameras tab renders paired camera reconnect and remove actions", () => {
  const markup = buildHomeMarkup("remote", "cameras", [
    {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Front door",
      lastConnectedAt: 1000
    }
  ]);

  assert.match(markup, /Front door/);
  assert.match(markup, /data-reconnect-pair="pair-1"/);
  assert.match(markup, /data-remove-pair="pair-1"/);
  assert.match(markup, /Reconnect/);
});

test("cameras tab renders an empty paired camera state", () => {
  const markup = buildHomeMarkup("remote", "cameras", []);

  assert.match(markup, /No paired cameras yet/);
  assert.match(markup, /Pair once with QR and PIN/);
});

test("home screen does not expose infrastructure setup terms", () => {
  const markup = buildHomeMarkup().toLowerCase();

  for (const term of ["server", "signaling", "turn", "nat", "deploy"]) {
    assert.equal(markup.includes(term), false, `unexpected term: ${term}`);
  }
});
