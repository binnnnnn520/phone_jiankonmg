# Remote Phone Monitoring App Design

Date: 2026-04-26

## Summary

Build a staged monitoring product that lets a user turn an idle phone into a remote live camera without buying dedicated monitoring hardware or managing server infrastructure.

Version 1 is a browser/PWA prototype focused on a two-phone user experience: an old phone runs the Camera PWA in the foreground with the screen on, another phone runs the Viewer PWA, and the user pairs them by scanning a QR code and entering a PIN. The product should prefer the simplest connection path available: local same-Wi-Fi connection when both phones are nearby, and hosted cloud signaling plus STUN/TURN when the viewer is outside the home network. Users should not be asked to deploy, configure, or understand a server. Phase 2 replaces the camera side with an Android native app to support background or lock-screen reliability.

## Product Goals

- Let ordinary home users reuse an idle phone as a live monitoring camera.
- Make the product feel usable with only two phones: one camera phone and one viewer phone.
- Support remote live viewing when the viewer is outside the home network.
- Avoid user-managed servers, port forwarding, router configuration, or command-line setup.
- Keep the first version small enough to validate the core value quickly.
- Make privacy boundaries explicit: no hidden recording, no cloud video storage, and visible camera-side monitoring status.
- Preserve a clean path to later Android native capture, local recording, motion detection, and alerts.

## Non-Goals for Version 1

- No browser background or lock-screen camera capture.
- No cloud recording, screenshots, or playback timeline.
- No old-phone local recording in Version 1.
- No requirement that ordinary users deploy or administer a signaling, TURN, or media server.
- No advanced router setup, port forwarding, static IP, or DDNS requirement for ordinary users.
- No motion detection, push alerts, device list, user account system, or multi-viewer broadcasting.
- No guarantee that monitoring continues if the camera phone sleeps, closes the browser, loses power, or loses network.

## Target User and Scenario

The first target is a general household user who wants to check a room, pet, doorway, or sleeping child using only two phones. The camera phone is expected to stay plugged in, on Wi-Fi, with the Camera PWA open in the foreground and the screen kept awake. The viewer may be on the same Wi-Fi for nearby checking, or on mobile data or another external network for remote viewing.

## Connection Strategy

Version 1 should present a simple two-phone pairing flow while the app chooses the connection path behind the scenes.

### Same-Wi-Fi Mode

When both phones are on the same local network, the app should prefer a local connection path. The target behavior is QR plus PIN pairing, local peer connection negotiation, and direct WebRTC media without depending on a user-managed server. If browser or network limits prevent fully local signaling in the PWA, the product may still use the hosted signaling service for coordination while clearly treating it as product infrastructure, not user setup.

### Remote Mode

When the viewer is away from the camera phone's local network, the app uses hosted signaling plus STUN/TURN. The hosted service creates rooms, validates PIN attempts, exchanges WebRTC offer/answer and ICE candidates, and returns ICE server configuration. Media still prefers direct WebRTC peer-to-peer transport; TURN is only a fallback for restricted networks.

### User-Facing Principle

The UI should describe modes as "same Wi-Fi direct connection" and "remote connection" instead of "server", "signaling", "NAT", or "TURN". Operational infrastructure belongs to the product owner, not the ordinary user.

## Phased Approach

### Version 1: PWA Remote Live Viewing

Version 1 includes:

- Camera PWA running on the old phone.
- Viewer PWA running on another phone or desktop browser.
- QR-code pairing plus 4-6 digit PIN verification.
- Same-Wi-Fi connection path for nearby two-phone use.
- Hosted signaling for room creation, PIN verification, WebRTC offer/answer exchange, ICE candidate exchange, and short-lived connection state when remote connectivity is needed.
- STUN/TURN configuration so WebRTC can connect remotely, using TURN relay when direct peer-to-peer connection fails.
- Clear connection, permission, and session-state UI.

Version 1 runtime condition:

- The old phone must stay plugged in.
- The Camera PWA must remain open in the foreground.
- The phone screen should remain on for reliable monitoring.

### Phase 2: Android Native Camera App

Phase 2 adds an Android native camera app that reuses the same cloud signaling and Viewer PWA. Its purpose is to support longer-running capture, foreground service controls, better device permissions, and eventually lock-screen/background behavior where Android policy and device constraints allow it.

### Future Recording Add-On

Recording is not in Version 1. When recording is added, video segments should be stored on the old phone by default, not in the cloud. The cloud may later store metadata, indexes, device online state, and remote access authorization, but should not be the default video storage location.

Local phone storage is preferred because it lowers cloud storage cost, improves privacy, and works better when upload bandwidth is limited. This implies future storage health checks, free-space warnings, retention rules, and secure remote access to phone-held files.

## Product Flow

1. The user opens the Camera PWA on the old phone.
2. The Camera PWA requests camera permission and starts a visible camera preview.
3. The Camera PWA creates a pairing session and selects the best available connection path.
4. For same-Wi-Fi use, the session prefers local/direct coordination where available; for remote use, the hosted signaling service returns a room ID, QR payload, PIN, and ICE server configuration.
5. The old phone displays the QR code, PIN, and a visible monitoring status.
6. The user opens the Viewer PWA on another device and scans the QR code or opens the room link.
7. The viewer enters the PIN.
8. The viewer and camera exchange WebRTC offer, answer, and ICE candidates through the selected signaling path.
9. WebRTC connects directly when possible. If direct connection fails, it falls back to TURN relay.
10. The viewer sees the live video. Both sides show connection status and provide a stop/disconnect action.

## System Architecture

### Camera PWA

Responsibilities:

- Request and manage camera permission with `getUserMedia`.
- Own the camera-side media stream lifecycle.
- Create a pairing session and display QR/PIN pairing information.
- Build and maintain the camera-side WebRTC peer connection.
- Show visible status for camera active, viewer connected, reconnecting, and stopped.
- Provide a clear stop-monitoring control.

### Viewer PWA

Responsibilities:

- Open a room from QR or link.
- Collect and submit PIN verification.
- Build and maintain the viewer-side WebRTC peer connection.
- Render the live video stream.
- Show connection state, retry actions, and end-session controls.

### Connection Mode Selector

Responsibilities:

- Determine whether the session is same-Wi-Fi/direct or remote.
- Prefer direct local connectivity for nearby two-phone use.
- Fall back to hosted signaling when local coordination is unavailable or the viewer is remote.
- Expose user-facing labels without leaking low-level networking terms.

### Local Connection Path

Responsibilities:

- Support nearby two-phone pairing on the same Wi-Fi where browser capabilities allow it.
- Preserve QR plus PIN admission so local mode does not become an unauthenticated camera feed.
- Keep media on WebRTC and avoid storing video.

### Hosted Signaling API

Responsibilities:

- Create short-lived rooms.
- Validate PIN attempts and apply retry limits.
- Exchange WebRTC offer, answer, and ICE candidates.
- Track coarse session state such as waiting, connecting, live, reconnecting, and ended.
- Expire inactive rooms and remove stale session state.

The hosted signaling service is product infrastructure. Ordinary users should not deploy or configure it.

The hosted signaling service may temporarily store:

- Room ID and expiry.
- Hashed PIN or short-lived PIN verification state.
- Offer, answer, and ICE candidates.
- Coarse connection timestamps and diagnostics.

The signaling service must not store:

- Video recordings.
- Screenshots.
- Persistent viewing history beyond minimal diagnostics.
- Hidden camera state.

### STUN/TURN

Responsibilities:

- Provide STUN for connectivity discovery.
- Provide TURN relay credentials for restricted networks.
- Allow WebRTC media to fall back to relay when peer-to-peer connection fails.

TURN relays encrypted WebRTC media but does not store video. It creates real bandwidth cost, so the product should expose operational metrics such as relay usage and session duration for cost monitoring.

## Core Modules

### Camera Session

Handles camera permission, media capture, room creation, QR/PIN display, WebRTC sender setup, and camera-side active status.

### Pairing and Auth

Handles QR payload generation, PIN verification, room expiry, retry limits, and admission control. Version 1 should allow one viewer per camera session to keep old-phone performance and upstream bandwidth predictable.

### Viewer Session

Handles room entry, PIN submission, video playback, reconnect actions, and viewer-side disconnect.

### Connection Mode

Chooses same-Wi-Fi/direct versus remote/hosted signaling behavior, reports a plain-language mode label, and falls back safely when the preferred path fails.

### Signaling

Handles the realtime message channel for room events, WebRTC offer/answer, ICE candidates, session end, and stale connection cleanup. In remote mode, this uses the hosted signaling service. In same-Wi-Fi mode, it should use local coordination where practical, with hosted signaling as an acceptable PWA fallback.

### Connectivity

Handles ICE server configuration, connection state mapping, retry policy, and diagnostics for peer-to-peer versus TURN-relayed connections.

### Safety UI

Handles visible camera-on status, viewer-connected status, stop monitoring, permission errors, and clear user-facing explanations.

## Error Handling

Version 1 must handle these user-facing cases:

- Camera permission denied.
- Camera device unavailable or already in use.
- Browser unsupported or production page not served over HTTPS.
- Same-Wi-Fi direct connection unavailable, with fallback to remote connection.
- QR code or room expired.
- Wrong PIN, too many PIN attempts, or room not found.
- Viewer tries to join when another viewer is already connected.
- Peer-to-peer connection fails and TURN fallback is attempted.
- TURN fallback fails.
- Camera page is closed, phone sleeps, network drops, or camera stream stops.
- Viewer network drops and reconnects.

States shown to users should be plain language, not low-level WebRTC terms. Suggested state names: waiting for viewer, checking same Wi-Fi, connecting nearby, connecting remotely, live, reconnecting, using relay connection, camera offline, session ended, and retry needed.

## Safety and Privacy Boundaries

- The camera phone must visibly indicate when monitoring is active.
- Both camera and viewer sides need a clear stop/disconnect action.
- Rooms should be short-lived and regenerated from the camera side.
- PIN retry limits should prevent unlimited guessing.
- Version 1 should not support hidden monitoring.
- Version 1 should not record or upload video.
- Production camera access requires HTTPS.
- Same-Wi-Fi mode and remote mode must use the same QR plus PIN admission model.
- The UI must not imply that users need to run their own server.

## Frontend UI Design Gate

Before implementing a major UI redesign, generate a raster UI design mockup with the image generation workflow and get user approval. After approval, implement the frontend to closely match the accepted mockup using repo-native HTML/CSS/TypeScript. The generated image is a design reference, not a runtime dependency, unless the user explicitly asks to use it as an asset.

## Testing and Acceptance Criteria

Version 1 is accepted when these checks pass:

- Camera PWA can request camera permission, create a room, and display QR plus PIN.
- Viewer PWA can scan/open the room, submit PIN, and view live video.
- Same-Wi-Fi two-phone validation works with the local/direct path or clearly falls back to hosted signaling without user setup.
- The old phone on home Wi-Fi can be watched from a viewer on mobile data.
- Direct WebRTC connection works where the network allows it.
- TURN fallback works when direct connection is blocked or unavailable.
- Permission denial, wrong PIN, expired room, camera page close, and network interruption produce clear recovery states.
- The old phone can run plugged in with the Camera PWA foregrounded and screen on for at least 30-60 minutes during manual validation.
- Signaling room lifecycle, PIN validation, message contracts, and client state machines have repeatable tests.

## Main Risks

- PWA camera capture is not reliable for background or lock-screen monitoring. This is intentionally deferred to Android native Phase 2.
- TURN relay can become expensive if many users stream for long periods. Version 1 needs operational visibility into relay usage.
- Old phones may overheat, sleep, throttle, or lose Wi-Fi during all-day use. Version 1 should communicate the foreground/screen-on requirement clearly.
- Browser limitations may prevent a completely serverless same-Wi-Fi PWA flow on some devices. The product should still avoid asking users to manage a server and should fall back to hosted signaling when needed.
- Browser support for camera, wake lock, QR scanning, and autoplay can vary by device and browser.
- TURN relay cost and privacy controls are tracked in `docs/operations/turn-and-signaling.md`.

## Approved Decisions

- Use the staged route: PWA first, Android native camera app later.
- Optimize the user experience for two phones and no user-managed infrastructure.
- Add a same-Wi-Fi mode before treating remote cloud signaling as the only pairing path.
- Version 1 supports remote viewing, not only same-Wi-Fi viewing.
- Include hosted signaling and TURN fallback in Version 1 to make remote viewing usable for ordinary users.
- Use QR pairing plus PIN verification.
- Use WebRTC for live video.
- Generate UI design mockups first for major frontend changes, then implement only after user approval.
- Limit Version 1 to one viewer per camera session.
- Do not record in Version 1.
- Future recordings should be stored on the old phone by default.
