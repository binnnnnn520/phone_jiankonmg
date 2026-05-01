# CentOS 7 Public-IP HTTPS Test Deployment

This guide is for the current test server:

- Public IP: `47.86.100.51`
- OS: CentOS 7.9 64-bit
- Existing HTTPS entry port: `443`
- No owned domain yet

The deployment uses `sslip.io` hostnames that resolve to the embedded IP:

- App: `https://app-47-86-100-51.sslip.io`
- Signaling API: `https://signal-47-86-100-51.sslip.io`
- WebSocket: `wss://signal-47-86-100-51.sslip.io/ws`

`sslip.io` and `nip.io` are temporary test DNS services. For production, replace
them with a domain you control.

## Security Shape

- Public internet must expose `443` for the app and signaling host.
- The Node signaling server binds to `127.0.0.1:8787`.
- Caddy terminates HTTPS and proxies `/ws` and API traffic to local `8787`.
- Do not run the Vite dev server on the public server.
- Do not open `8787` in the cloud firewall.
- TURN relay is a separate requirement. Once TURN is added, the single-port-443 shape is no longer enough by itself. A TURN listener and relay port range must also be reachable from the public internet.

Anyone who knows the app URL can load the page, but they still need a live room
and the viewer PIN to watch. This is acceptable for a short technical test, not
for a production release with real users.

## 1. Build Locally On Windows

Run this from the repository root on Windows:

```powershell
$env:VITE_SIGNALING_HTTP_URL="https://signal-47-86-100-51.sslip.io"
$env:VITE_SIGNALING_WS_URL="wss://signal-47-86-100-51.sslip.io/ws"
$env:VITE_PUBLIC_VIEWER_URL="https://app-47-86-100-51.sslip.io/"
cmd /c "call D:\APP\anaconda\Scripts\activate.bat jiankong_app && npm.cmd run build"
```

The build output that must exist before upload:

- `packages/web/dist`
- `packages/server/dist`
- `packages/shared/dist`

## 2. Prepare The Server

SSH into the server:

```bash
ssh root@47.86.100.51
```

Install runtime tools. Node 16 is used here because CentOS 7 has an old glibc;
the TypeScript/Vite build stays on the Windows machine.

```bash
yum install -y git curl tar gzip
curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
yum install -y nodejs
node -v
npm -v
```

Prepare the app directory:

```bash
mkdir -p /opt/phone_jiankonmg
git clone https://github.com/binnnnnn520/phone_jiankonmg.git /opt/phone_jiankonmg
cd /opt/phone_jiankonmg
npm ci --omit=dev
```

If the directory already exists during a later redeploy:

```bash
cd /opt/phone_jiankonmg
git pull --ff-only
npm ci --omit=dev
```

## 3. Upload Local Build Output

Run these from Windows PowerShell in the repository root:

```powershell
scp -r packages/web/dist root@47.86.100.51:/opt/phone_jiankonmg/packages/web/
scp -r packages/server/dist root@47.86.100.51:/opt/phone_jiankonmg/packages/server/
scp -r packages/shared/dist root@47.86.100.51:/opt/phone_jiankonmg/packages/shared/
```

## 4. Create The Signaling Service

On the server, create `/etc/systemd/system/phone-monitor-signal.service`:

```ini
[Unit]
Description=Phone monitor signaling server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/phone_jiankonmg
Environment=SIGNALING_HOST=127.0.0.1
Environment=SIGNALING_PORT=8787
Environment=PUBLIC_SIGNALING_HTTP_URL=https://signal-47-86-100-51.sslip.io
Environment=ROOM_TTL_SECONDS=600
Environment=PIN_MAX_ATTEMPTS=5
Environment='ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:47.86.100.51:3478?transport=udp","turn:47.86.100.51:3478?transport=tcp"],"username":"phone-monitor","credential":"REPLACE_WITH_TURN_PASSWORD"}]'
ExecStart=/usr/bin/node packages/server/dist/src/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Start it:

```bash
systemctl daemon-reload
systemctl enable --now phone-monitor-signal
systemctl status phone-monitor-signal --no-pager
curl http://127.0.0.1:8787/health
```

Expected health output:

```json
{"ok":true}
```

The app currently passes `ICE_SERVERS_JSON` straight through to the browser.
That means the TURN entries in this file must use real static credentials that
match the coturn configuration. The app does not mint temporary TURN
credentials yet.

## 5. Install And Configure TURN

This product needs TURN for real remote-network reliability. HTTPS and signaling
alone are not enough for viewer devices on mobile data or restrictive networks.

### Required public firewall shape for TURN

Open these ports to the public internet on the server:

- `3478/udp` for TURN and STUN over UDP
- `3478/tcp` for TURN over TCP fallback
- a relay UDP port range such as `49160-49200/udp`

Optional:

- `5349/tcp` if you also want a dedicated TLS TURN listener

Do not try to proxy TURN through Caddy. TURN relay is not ordinary HTTPS
traffic, and the relay port range must be reachable directly.

### Install coturn

CentOS 7 images often need EPEL for the `coturn` package:

```bash
yum install -y epel-release
yum install -y coturn
turnserver -V
```

If the package is unavailable on the image, install coturn by another supported
operator path before continuing.

### Write `/etc/turnserver.conf`

Create `/etc/turnserver.conf`:

```ini
listening-ip=0.0.0.0
external-ip=47.86.100.51
listening-port=3478

min-port=49160
max-port=49200

fingerprint
lt-cred-mech
realm=47.86.100.51
server-name=47.86.100.51
user=phone-monitor:REPLACE_WITH_TURN_PASSWORD

no-loopback-peers
no-multicast-peers
```

This uses static long-term credentials because the current app expects static
`username` and `credential` values inside `ICE_SERVERS_JSON`.

If you later add TURN REST temporary credentials in the app and signaling
service, this file can move to `use-auth-secret` instead. That is not part of
the current implementation.

### Start coturn

On CentOS packages, the service name is typically `coturn` or `turnserver`.
Use the one provided by the package on the server.

Example:

```bash
systemctl enable --now coturn
systemctl status coturn --no-pager
ss -lntup | grep 3478
```

Expected result:

- TURN is listening on `0.0.0.0:3478`
- the chosen relay UDP range is allowed in the cloud firewall and local firewall

## 6. Install And Configure Caddy

Caddy's packaged install currently documents `dnf` for CentOS/RHEL. CentOS 7
servers often only have `yum`, so use the packaged path if `dnf` is available;
otherwise install a static Caddy binary from the official release page.

For CentOS 7, the static binary path is usually the least fragile:

```bash
yum install -y curl tar gzip libcap
CADDY_VERSION="$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest | grep -m1 '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')"
curl -fL -o /tmp/caddy.tar.gz "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
tar -xzf /tmp/caddy.tar.gz -C /tmp caddy
install -m 0755 /tmp/caddy /usr/local/bin/caddy
setcap 'cap_net_bind_service=+ep' /usr/local/bin/caddy
groupadd --system caddy || true
useradd --system --gid caddy --home-dir /var/lib/caddy --shell /sbin/nologin caddy || true
mkdir -p /etc/caddy /var/lib/caddy /var/log/caddy
chown -R caddy:caddy /var/lib/caddy /var/log/caddy
```

Create `/etc/caddy/Caddyfile`:

```caddyfile
{
	auto_https disable_redirects
}

app-47-86-100-51.sslip.io {
	root * /opt/phone_jiankonmg/packages/web/dist
	try_files {path} /index.html
	file_server
	tls {
		issuer acme {
			disable_http_challenge
		}
	}
}

signal-47-86-100-51.sslip.io {
	reverse_proxy 127.0.0.1:8787
	tls {
		issuer acme {
			disable_http_challenge
		}
	}
}
```

The `disable_http_challenge` setting keeps certificate validation on the
TLS-ALPN challenge over port `443`.

Create `/etc/systemd/system/caddy.service` if the static binary path was used:

```ini
[Unit]
Description=Caddy web server
Documentation=https://caddyserver.com/docs/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=caddy
Group=caddy
Environment=XDG_DATA_HOME=/var/lib/caddy
Environment=XDG_CONFIG_HOME=/etc/caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Start or reload Caddy:

```bash
systemctl daemon-reload
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
systemctl status caddy --no-pager
```

If Caddy is not installed as a systemd service, start it manually for the first
test:

```bash
caddy run --config /etc/caddy/Caddyfile
```

## 7. Validate From Outside The Server

From your Windows machine:

```powershell
curl.exe https://signal-47-86-100-51.sslip.io/health
```

Then open:

- Camera phone: `https://app-47-86-100-51.sslip.io/?mode=camera`
- Viewer phone: `https://app-47-86-100-51.sslip.io/?mode=viewer`

Use the old phone as the camera. Use mobile data on the viewer phone for the
real outside-network test.

Before the real device test, also confirm the signaling service is serving TURN
entries to the browser:

- create a room from the camera page
- inspect the room creation response in the browser network tab
- confirm `iceServers` includes both the public STUN entry and the public TURN
  entries with the static credentials you configured

## 8. TURN Validation Outcome

If both HTTPS pages load, the room and PIN work, but the viewer video stays
black or stuck on connecting from mobile data, the HTTPS/signaling deployment
is working but TURN is still not usable. Check these in order:

1. `ICE_SERVERS_JSON` really contains public TURN entries, not only STUN
2. TURN username and password match the coturn `user=` line
3. `3478/udp` and the relay UDP range are open in the cloud firewall
4. the server's local firewall also allows the same ports
5. coturn is listening on the intended public interface
6. the viewer test is being run from a truly remote network such as mobile data

Do not treat the deployment as remote-ready until a real external viewer session
works through the deployed HTTPS/WSS/TURN path.
