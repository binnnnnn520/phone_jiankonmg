# Manual Two-Phone Validation

## Required Devices

- One old Android phone for the Camera PWA.
- One viewer phone.
- One desktop browser for debugging.
- For future same-Wi-Fi validation: both phones on the same Wi-Fi after the nearby path is implemented.
- For remote validation: camera phone on home Wi-Fi and viewer phone on mobile data.
- A deployed HTTPS URL for the PWA and product-operated signaling service.
- Product-operated STUN/TURN credentials configured in `ICE_SERVERS_JSON`.

## Same-Wi-Fi Two-Phone Checks

1. Camera phone on home Wi-Fi opens the Camera PWA.
2. Camera permission is granted.
3. Camera phone remains plugged in, foregrounded, and screen-on.
4. Viewer phone joins the same Wi-Fi.
5. Viewer scans QR or opens the room link.
6. Viewer enters the PIN shown on the camera phone.
7. Until a true nearby path is implemented, UI labels the session as Remote without asking the user to deploy a server.
8. Live video appears within 20 seconds.
9. Closing the camera page changes the viewer state to camera offline.
10. Wrong PIN shows a clear error and does not start playback.
11. Expired room requires regenerating QR and PIN on the camera phone.
12. A 30-60 minute screen-on session remains live or reconnects with a clear state.

## Remote Two-Phone Checks

1. Camera phone stays on home Wi-Fi and keeps the Camera PWA foregrounded.
2. Viewer phone disables Wi-Fi and uses mobile data.
3. Viewer scans QR or opens the room link.
4. Viewer enters the PIN shown on the camera phone.
5. UI labels the session as Remote.
6. Live video appears within 20 seconds.
7. If direct WebRTC connection fails, the session enters a relayed connection and still plays.
8. Closing the camera page changes the viewer state to camera offline.
9. Wrong PIN shows a clear error and does not start playback.
10. Expired room requires regenerating QR and PIN on the camera phone.
11. A 30-60 minute screen-on session remains live or reconnects with a clear state.

## Evidence To Capture

- Browser console has no uncaught runtime errors.
- Product-operated signaling logs show room creation, viewer join, and session end for hosted remote paths.
- Metrics record whether TURN relay was used.
- User-facing state text matches the observed connection behavior.
- No user-facing screen tells ordinary users to deploy, configure, or maintain a server.
