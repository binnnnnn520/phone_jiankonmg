import assert from "node:assert/strict";
import test from "node:test";
import type { ViewerPairedCamera } from "@phone-monitor/shared";
import { buildHomeMarkup } from "../src/home.js";

test("home screen presents the two-phone approved UI copy", () => {
  const markup = buildHomeMarkup();

  assert.match(markup, /Two phones, live view/);
  assert.match(markup, /Use this phone as camera/);
  assert.match(markup, /Watch a camera/);
  assert.match(markup, /Same Wi-Fi/);
  assert.match(markup, /Remote/);
});

test("home screen exposes the light dashboard structure", () => {
  const markup = buildHomeMarkup();

  assert.match(markup, /class="app-shell home-shell light-monitor-shell"/);
  assert.match(markup, /class="home-status-strip"/);
  assert.match(markup, /class="action-card camera-card primary-action"/);
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

test("me tab renders saved connection counts", () => {
  const markup = buildHomeMarkup("remote", "me", [
    {
      pairId: "pair-1",
      cameraDeviceId: "camera-device-1",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token",
      displayName: "Front door",
      lastConnectedAt: 1000
    },
    {
      pairId: "pair-2",
      cameraDeviceId: "camera-device-2",
      viewerDeviceId: "viewer-device-1",
      viewerPairToken: "viewer-pair-token-2",
      displayName: "Back room",
      lastConnectedAt: 2000
    }
  ]);

  assert.match(markup, /Your connections/);
  assert.match(markup, /data-connection-count="saved"[^>]*>2<\/strong>/);
  assert.match(markup, /data-connection-count="live"[^>]*>Checking<\/strong>/);
  assert.match(markup, /data-connection-count="offline"[^>]*>Checking<\/strong>/);
});

test("me tab renders compact battery status near connection summary", () => {
  const markup = buildHomeMarkup("remote", "me");
  const summaryIndex = markup.indexOf("connection-summary");
  const batteryIndex = markup.indexOf("data-battery-status");
  const cameraNameIndex = markup.indexOf("Camera name");

  assert.notEqual(batteryIndex, -1);
  assert.match(markup, /Battery unavailable/);
  assert.ok(summaryIndex < batteryIndex);
  assert.ok(batteryIndex < cameraNameIndex);
});

test("me tab renders an editable camera name", () => {
  const markup = buildHomeMarkup("remote", "me", [], "Kitchen phone");

  assert.match(markup, /Camera name/);
  assert.match(markup, /value="Kitchen phone"/);
  assert.match(markup, /data-camera-name-save/);
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

test("cameras tab renders saved cameras live-first, then newest connection", () => {
  const oldLive = buildCamera("pair-old-live", "Old live", 1000);
  const newOffline = buildCamera("pair-new-offline", "New offline", 4000);
  const newLive = buildCamera("pair-new-live", "New live", 3000);
  const markup = buildHomeMarkup(
    "remote",
    "cameras",
    [newOffline, oldLive, newLive],
    "This phone camera",
    {
      pairStatuses: {
        "pair-old-live": "live",
        "pair-new-live": "live",
        "pair-new-offline": "offline"
      }
    }
  );

  assert.ok(markup.indexOf("New live") < markup.indexOf("Old live"));
  assert.ok(markup.indexOf("Old live") < markup.indexOf("New offline"));
  assert.match(markup, /data-pair-status="pair-new-live"[^>]*>Live</);
  assert.match(markup, /data-pair-status="pair-new-offline"[^>]*>Offline</);
});

test("cameras tab includes compact search and filters by display name", () => {
  const markup = buildHomeMarkup(
    "remote",
    "cameras",
    [
      buildCamera("pair-front", "Front door", 1000),
      buildCamera("pair-nursery", "Nursery", 2000)
    ],
    "This phone camera",
    { cameraSearchQuery: "front" }
  );

  assert.match(markup, /type="search"/);
  assert.match(markup, /data-camera-search/);
  assert.match(markup, /value="front"/);
  assert.match(markup, /Front door/);
  assert.doesNotMatch(markup, /Nursery/);
});

test("cameras tab shows a no matching cameras state for empty search results", () => {
  const markup = buildHomeMarkup(
    "remote",
    "cameras",
    [buildCamera("pair-front", "Front door", 1000)],
    "This phone camera",
    { cameraSearchQuery: "garage" }
  );

  assert.match(markup, /No matching cameras/);
  assert.doesNotMatch(markup, /data-reconnect-pair="pair-front"/);
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

function buildCamera(
  pairId: string,
  displayName: string,
  lastConnectedAt: number
): ViewerPairedCamera {
  return {
    pairId,
    cameraDeviceId: `camera-${pairId}`,
    viewerDeviceId: "viewer-device",
    viewerPairToken: `viewer-token-${pairId}`,
    displayName,
    lastConnectedAt
  };
}
