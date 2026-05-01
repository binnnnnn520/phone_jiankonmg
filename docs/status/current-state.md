# Current Product State

Last updated: 2026-05-01

## Summary

The repository currently contains a Version 1 browser/PWA live monitoring prototype.

The main user flow is working:

1. The camera side starts monitoring
2. A room is created
3. The viewer scans a QR code and enters a PIN
4. Live video reaches the viewer over WebRTC
5. Environment audio is available live when microphone access is granted

This is a visible foreground monitoring product. It is not a hidden listening tool, and it does not record or save media.

## Done

- Two-device camera/viewer flow
- QR plus PIN pairing
- WebRTC live video
- Live-only environment audio
- Camera-side microphone fallback to video-only
- Viewer-side mute and unmute control
- Product-facing copy that avoids server setup wording
- Public HTTPS test deployment path documented with `sslip.io`
- Manual validation guide for same-Wi-Fi and remote scenarios
- Root README with local development and test deployment instructions

## Working boundaries

- No phone call recording
- No saved audio or video files
- No playback history
- No motion detection
- No alerting
- No account system
- No background-reliable camera capture on mobile browsers
- Same-Wi-Fi currently still presents as `Remote` until a true nearby path is implemented

## Operational status

- Signaling service exists and is documented
- Public HTTPS hosting path is documented
- STUN/TURN is part of the architecture and environment contract
- The local `.env.example` includes a placeholder local TURN entry for development shape only
- The current CentOS public-IP deployment guide still shows a STUN-only sample signaling service configuration
- TURN still needs full operator-side deployment and real remote validation before remote reliability can be treated as complete

## Plan status

The older implementation plans in `docs/superpowers/plans/` are useful as historical design and execution records, but they are not the best source of truth for current completion state. Several planned items are already implemented in code, while some later operational items remain incomplete.

Use this file plus the docs under `docs/operations/` and `docs/testing/` as the current status reference.

## Highest-priority next steps

1. Complete TURN deployment and configuration verification
2. Run and record real-device remote validation over a deployed HTTPS/WSS/TURN path
3. Add a concise deployment checklist for repeatable operator setup
4. Decide whether the next product phase stays on PWA or moves the camera side to Android native
