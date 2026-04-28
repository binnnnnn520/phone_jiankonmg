# TURN and Signaling Operations

This document is for the product operator. Ordinary users do not deploy or configure this infrastructure. The user-facing product should feel like a two-phone pairing flow: one camera phone, one viewer phone, QR plus PIN, and plain-language connection states.

## Runtime Components

- PWA host served over HTTPS.
- Product-operated signaling API with WebSocket support.
- Product-operated STUN/TURN service reachable from mobile networks.

## Product Positioning

- Same-Wi-Fi sessions should prefer a nearby/direct connection path where practical. The current app defaults to Remote until that nearby path is implemented.
- Remote sessions use hosted signaling and STUN/TURN without exposing setup steps to the user.
- The hosted signaling service is not a media server and must not store video, screenshots, or frame data.
- UI copy should use labels such as "Same Wi-Fi", "Remote", "Live", and "Using relay connection" instead of signaling, NAT, TURN, or server setup language.

## Required Environment

Server:

- `SIGNALING_HOST`: interface for the signaling server to bind.
- `SIGNALING_PORT`: signaling HTTP/WebSocket port.
- `PUBLIC_SIGNALING_HTTP_URL`: public HTTPS signaling API URL used in server room payloads.
- `ICE_SERVERS_JSON`: JSON array of STUN and TURN servers.
- `ROOM_TTL_SECONDS`: short room lifetime, default 600.
- `PIN_MAX_ATTEMPTS`: bounded PIN attempts, default 5.

PWA build-time variables:

- `VITE_SIGNALING_HTTP_URL`: public HTTPS signaling API URL used by the browser.
- `VITE_SIGNALING_WS_URL`: public WSS signaling WebSocket URL used by the browser.
- `VITE_PUBLIC_VIEWER_URL`: public Viewer PWA URL placed in the camera QR code. The QR URL must include only the room ID, never the camera admission token.
- `VITE_PREFERRED_CONNECTION_MODE`: optional development/testing override. Use `auto`, `nearby`, or `remote`; production should default to `auto`, which currently displays Remote.

Room creation returns a private camera admission token to the Camera PWA. Keep that token out of QR codes, logs, and viewer URLs.

## Cost Guardrails

- Track session duration.
- Track whether a session used direct or relayed connectivity.
- Track aggregate TURN relay minutes.
- Keep one viewer per camera session in Version 1.
- Prefer video constraints that fit mobile uplink, such as 720p or lower during early validation.

## Privacy Guardrails

- Do not log SDP payload contents in production logs.
- Do not store video, screenshots, or frame data.
- Keep room state short-lived.
- Keep camera-side monitoring status visible.

## Validation

- Same-Wi-Fi validation is for the future nearby path. Current validation should confirm the app clearly displays Remote without user setup.
- Playwright covers local fake-device pairing through room creation, PIN verification, signaling, and remote video stream attachment.
- Still validate at least one real camera phone and one remote viewer over the deployed HTTPS/WSS/TURN path before treating a deployment as production-ready.

## Deployment Notes

- For the current CentOS 7 public-IP test server, see `docs/operations/centos-7-ip-443-deploy.md`.
