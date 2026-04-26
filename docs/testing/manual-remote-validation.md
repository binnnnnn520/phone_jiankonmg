# Manual Remote Validation

## Required Devices

- One old Android phone for the Camera PWA.
- One viewer phone with mobile data enabled.
- One desktop browser for debugging.
- A deployed HTTPS URL for the PWA and signaling service.
- STUN/TURN credentials configured in `ICE_SERVERS_JSON`.

## Checks

1. Camera phone on home Wi-Fi opens the Camera PWA.
2. Camera permission is granted.
3. Camera phone remains plugged in, foregrounded, and screen-on.
4. Viewer phone disables Wi-Fi and uses mobile data.
5. Viewer scans QR or opens the room link.
6. Viewer enters the PIN shown on the camera phone.
7. Live video appears within 20 seconds.
8. If direct connection fails, the session enters a relayed connection and still plays.
9. Closing the camera page changes the viewer state to camera offline.
10. Wrong PIN shows a clear error and does not start playback.
11. Expired room requires regenerating QR and PIN on the camera phone.
12. A 30-60 minute screen-on session remains live or reconnects with a clear state.

## Evidence To Capture

- Browser console has no uncaught runtime errors.
- Server logs show room creation, viewer join, and session end.
- Metrics record whether TURN relay was used.
- User-facing state text matches the observed connection behavior.
