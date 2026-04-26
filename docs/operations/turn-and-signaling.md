# TURN and Signaling Operations

## Runtime Components

- PWA host served over HTTPS.
- Signaling API with WebSocket support.
- STUN/TURN service reachable from mobile networks.

## Required Environment

- `PUBLIC_SIGNALING_HTTP_URL`: public HTTPS signaling API URL.
- `PUBLIC_SIGNALING_WS_URL`: public WSS signaling WebSocket URL.
- `ICE_SERVERS_JSON`: JSON array of STUN and TURN servers.
- `ROOM_TTL_SECONDS`: short room lifetime, default 600.
- `PIN_MAX_ATTEMPTS`: bounded PIN attempts, default 5.

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
