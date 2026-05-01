# TURN Rollout Validation - 2026-05-01

## Scope

Validation for the current public test deployment:

- App: `https://app-47-86-100-51.sslip.io`
- Signaling: `https://signal-47-86-100-51.sslip.io`
- TURN: `47.86.100.51:3478`

## Server Checks

- Public app endpoint returned `200 OK`.
- Public signaling health endpoint returned `{"ok":true}`.
- SSH administration to `root@47.86.100.51` worked.
- Deployed repository was fast-forwarded to `ae11696`.
- Latest local production web build was uploaded with public `VITE_SIGNALING_*` values.
- `phone-monitor-signal.service` restarted and stayed active.
- `coturn.service` was already installed, enabled, and active.
- coturn was listening on `3478/tcp` and `3478/udp`.
- Public TCP reachability to `47.86.100.51:3478` returned true.
- Host iptables policy was ACCEPT for input, forward, and output.

## ICE Configuration

The public room creation API returned:

- one STUN entry
- one TURN entry
- TURN UDP URL: `turn:47.86.100.51:3478?transport=udp`
- TURN TCP URL: `turn:47.86.100.51:3478?transport=tcp`
- TURN username present
- TURN credential present

The signaling service reads ICE configuration from `/etc/phone-monitor-ice.json`.

## Deployed App Smoke Test

A headless Chrome smoke test against the public app used fake camera and fake
microphone media:

1. Opened the public camera page.
2. Waited for public `/rooms` creation.
3. Opened the public viewer page with the returned room ID.
4. Entered the returned PIN.
5. Connected the viewer.

Observed result:

- room created: yes
- ICE server count: 2
- TURN present: yes
- viewer status: `Live`
- viewer audio status: `Environment audio is live`
- remote stream attached: yes
- browser console errors: none

## Remaining Manual Check

The only remaining validation that cannot be completed from this workstation is
physical real-device remote validation:

1. Camera device on Wi-Fi.
2. Viewer phone on mobile data.
3. Scan QR or open room link.
4. Enter PIN.
5. Confirm live video.
6. Unmute and confirm live environment audio.
7. Stop monitoring and confirm camera and microphone release.

This manual check is still required before treating the deployment as fully
remote-ready.
