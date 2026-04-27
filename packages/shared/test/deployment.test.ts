import assert from "node:assert/strict";
import test from "node:test";
import { buildIpDeploymentUrls } from "../src/deployment.js";

test("builds HTTPS and WSS deployment URLs from a public IPv4 address", () => {
  assert.deepEqual(buildIpDeploymentUrls("47.86.100.51"), {
    appHost: "app-47-86-100-51.sslip.io",
    signalHost: "signal-47-86-100-51.sslip.io",
    appUrl: "https://app-47-86-100-51.sslip.io",
    cameraUrl: "https://app-47-86-100-51.sslip.io/?mode=camera",
    viewerUrl: "https://app-47-86-100-51.sslip.io/?mode=viewer",
    signalingHttpUrl: "https://signal-47-86-100-51.sslip.io",
    signalingWsUrl: "wss://signal-47-86-100-51.sslip.io/ws"
  });
});

test("rejects non-public IPv4 addresses because public TLS will not work", () => {
  assert.throws(
    () => buildIpDeploymentUrls("192.168.1.20"),
    /public IPv4 address/
  );
});

