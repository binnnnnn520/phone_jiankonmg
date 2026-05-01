# Phone Monitor App

A WebRTC-based two-device live monitoring prototype.

- An old phone or desktop browser acts as the camera side
- Another phone acts as the viewer side
- Devices pair through QR code plus PIN
- Live video and environment audio stream in real time
- No recording and no media file storage

The current version is meant to validate the end-to-end live monitoring flow, not background persistence or call recording.

## Current capabilities

- The camera side creates a room and shows a QR code
- The viewer side scans the QR code and enters a PIN to join
- Live video is delivered over WebRTC
- Environment audio is requested by default when monitoring starts
- The camera side falls back to video-only if microphone capture fails
- The viewer can mute or unmute playback locally
- The signaling service keeps only short-lived room and session state and does not store video or audio content

## Current boundaries

- No phone call recording
- No hidden listening mode
- No saved audio or video files
- The browser/PWA camera side must stay in the foreground
- If a QR code points to `localhost`, another device cannot use it directly; cross-device testing should use a public HTTPS URL or a reachable LAN address

## Repository layout

```text
packages/
  shared/   Shared types, state helpers, deployment helpers
  server/   HTTP + WebSocket signaling service
  web/      Vite frontend with camera and viewer modes

docs/
  operations/             Runbooks and deployment guides
  superpowers/specs/      Design specs
  superpowers/plans/      Implementation plans
```

## Tech stack

- TypeScript
- Vite
- WebRTC
- WebSocket
- Node.js npm workspaces
- Playwright for end-to-end testing

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env`, or set the variables directly.

Default local values:

```env
SIGNALING_HOST=0.0.0.0
SIGNALING_PORT=8787
PUBLIC_SIGNALING_HTTP_URL=http://localhost:8787
ROOM_TTL_SECONDS=600
PIN_MAX_ATTEMPTS=5
PAIR_STORE_FILE=data/pairs.json
ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:localhost:3478","username":"local-dev","credential":"local-dev"}]

VITE_SIGNALING_HTTP_URL=http://localhost:8787
VITE_SIGNALING_WS_URL=ws://localhost:8787/ws
VITE_PUBLIC_VIEWER_URL=http://localhost:5173/
VITE_PREFERRED_CONNECTION_MODE=auto
```

### 3. Start the services

Start signaling first:

```bash
npm run dev:server
```

Then start the frontend:

```bash
npm run dev:web
```

Default addresses:

- Frontend: `http://localhost:5173/`
- Signaling health check: `http://localhost:8787/health`

### 4. Use the app locally

Recommended local camera page:

- `http://localhost:5173/?mode=camera`

Recommended local viewer page:

- `http://localhost:5173/?mode=viewer`

If a desktop browser is used as the camera side, `localhost` usually gets camera and microphone permissions more reliably.

If a phone scans a QR code from the desktop, the QR target must not be the phone's own `localhost`. For cross-device testing, a public HTTPS deployment is the more reliable path.

## Public HTTPS test deployment

The repository already includes a public-IP plus `sslip.io` deployment path. See:

- [docs/operations/centos-7-ip-443-deploy.md](docs/operations/centos-7-ip-443-deploy.md)
- [docs/operations/turn-and-signaling.md](docs/operations/turn-and-signaling.md)

Current test endpoints:

- App: `https://app-47-86-100-51.sslip.io`
- Signaling HTTP: `https://signal-47-86-100-51.sslip.io`
- Signaling WebSocket: `wss://signal-47-86-100-51.sslip.io/ws`

Recommended public test flow:

1. Open the camera page on the desktop or old phone
2. Allow camera and microphone permissions
3. Scan the QR code from the viewer phone
4. Enter the PIN and connect
5. Tap `Unmute audio` on the viewer to validate environment audio

## Common commands

```bash
npm run build
npm run test
npm run typecheck
npm run test:e2e
```

You can also run workspace-specific commands:

```bash
npm run build --workspace @phone-monitor/web
npm run test --workspace @phone-monitor/web
npm run build --workspace @phone-monitor/server
npm run test --workspace @phone-monitor/server
```

## Acceptance checklist

Minimal acceptance flow:

1. Open `?mode=camera` on the camera side
2. Confirm the page shows a live preview
3. Confirm the status shows video and environment audio are live, or falls back to video-only if microphone access is denied
4. Scan the QR code on the viewer side and enter the PIN
5. Confirm live video appears on the viewer side
6. Unmute the viewer and confirm environment audio is audible
7. Stop monitoring and confirm the viewer disconnects and the camera-side device releases camera and microphone access

## Design rules

- Ordinary users should not need to understand signaling, NAT, TURN, or server setup
- The signaling service is product infrastructure, not a user-operated system
- Media stays on WebRTC and does not pass through a recording service
- Monitoring state must stay visible on the camera side
- This version prioritizes usability validation and connection reliability

## Known next steps

- Continue improving same-Wi-Fi direct behavior
- Add an Android-native camera-side app in a later phase for more reliable long-running foreground use
- Add TURN for broader remote-network validation
