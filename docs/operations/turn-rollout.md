# TURN Rollout Runbook

This runbook is the practical operator sequence for making remote viewing work
reliably on the current deployment shape.

Use this after the app and signaling stack already run over HTTPS and WSS.

## Goal

Move from:

- app page loads
- signaling works
- some remote viewer sessions may still fail

to:

- app page loads
- signaling works
- TURN is reachable
- real external viewer sessions work over mobile data or other remote networks

## Before you start

Confirm these are already true:

1. The public app URL loads over HTTPS
2. The public signaling health endpoint returns `{"ok":true}`
3. The current web build is available on the server
4. You have root or equivalent operator access on the CentOS host

Reference docs:

- [centos-7-ip-443-deploy.md](centos-7-ip-443-deploy.md)
- [deploy-checklist.md](deploy-checklist.md)
- [turnserver.conf.example](turnserver.conf.example)
- [manual-remote-validation.md](../testing/manual-remote-validation.md)

## Step 1: Prepare production values

Start from:

- [.env.production.example](../../.env.production.example)

Decide these real values before touching the server:

- public app host
- public signaling host
- public server IP used by TURN
- TURN username
- TURN password
- relay UDP port range

For the current implementation, keep TURN credentials static. The app does not
mint temporary TURN credentials yet.

## Step 2: Open the required network paths

HTTPS alone is not enough for TURN.

Open these ports to the public internet:

- `443/tcp`
- `3478/udp`
- `3478/tcp`
- your chosen relay UDP range, for example `49160-49200/udp`

Also confirm the host-local firewall allows the same ports.

Do not expose `8787` publicly.

## Step 3: Install and configure coturn

On the CentOS server:

```bash
yum install -y epel-release
yum install -y coturn
turnserver -V
```

Create `/etc/turnserver.conf` from:

- [turnserver.conf.example](turnserver.conf.example)

Replace the placeholders:

- `REPLACE_WITH_PUBLIC_IP`
- `REPLACE_WITH_PUBLIC_IP_OR_HOST`
- `REPLACE_WITH_TURN_PASSWORD`

Keep the config aligned with the app's static ICE configuration:

- `user=phone-monitor:...`
- `listening-port=3478`
- `min-port` and `max-port` matching the opened UDP relay range

Start the service:

```bash
systemctl enable --now coturn
systemctl status coturn --no-pager
ss -lntup | grep 3478
```

Success means:

- coturn is listening on the intended public interface
- the service stays up after start

## Step 4: Update signaling server ICE configuration

Update the signaling service environment so `ICE_SERVERS_JSON` includes:

1. at least one STUN entry
2. public TURN UDP and TCP entries
3. the same static TURN username and password used in coturn

Example shape:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": [
      "turn:PUBLIC_IP_OR_HOST:3478?transport=udp",
      "turn:PUBLIC_IP_OR_HOST:3478?transport=tcp"
    ],
    "username": "phone-monitor",
    "credential": "TURN_PASSWORD"
  }
]
```

Then restart signaling:

```bash
systemctl daemon-reload
systemctl restart phone-monitor-signal
systemctl status phone-monitor-signal --no-pager
curl http://127.0.0.1:8787/health
```

## Step 5: Confirm the browser receives TURN entries

Before any real phone test:

1. Open the camera page
2. Start a room
3. Inspect the room creation response in the browser network tab
4. Confirm `iceServers` includes the intended TURN entries

If the browser still receives STUN-only configuration, stop here and fix the
signaling environment first.

## Step 6: Run the real remote validation

Use the detailed checklist in:

- [manual-remote-validation.md](../testing/manual-remote-validation.md)

At minimum, run this flow:

1. Camera device on home Wi-Fi
2. Viewer device on mobile data
3. Scan QR or open the room link
4. Enter the PIN
5. Confirm live video appears
6. Confirm audio works after unmuting on the viewer
7. Confirm the session survives the expected network path or clearly reconnects

## Step 7: Record outcome

For each rollout attempt, capture:

- whether the viewer connected successfully from a real remote network
- whether relay was used
- whether audio worked
- whether any firewall or coturn changes were required
- any browser console or server log errors

If remote viewing still fails after TURN is configured, check these first:

1. TURN credentials mismatch between coturn and `ICE_SERVERS_JSON`
2. public firewall still missing `3478` or the relay UDP range
3. local host firewall still missing the same ports
4. coturn listening on the wrong interface
5. the viewer device is not actually on an external network

## Done criteria

This rollout is complete only when:

- HTTPS app hosting works
- WSS signaling works
- TURN entries are present in browser ICE configuration
- a real external viewer session succeeds end to end
- the operator can repeat the result from the documented configuration
