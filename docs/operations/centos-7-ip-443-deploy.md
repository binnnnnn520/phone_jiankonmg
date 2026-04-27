# CentOS 7 Public-IP HTTPS Test Deployment

This guide is for the current test server:

- Public IP: `47.86.100.51`
- OS: CentOS 7.9 64-bit
- Public inbound port: `443`
- No owned domain yet

The deployment uses `sslip.io` hostnames that resolve to the embedded IP:

- App: `https://app-47-86-100-51.sslip.io`
- Signaling API: `https://signal-47-86-100-51.sslip.io`
- WebSocket: `wss://signal-47-86-100-51.sslip.io/ws`

`sslip.io` and `nip.io` are temporary test DNS services. For production, replace
them with a domain you control.

## Security Shape

- Public internet exposes only port `443`.
- The Node signaling server binds to `127.0.0.1:8787`.
- Caddy terminates HTTPS and proxies `/ws` and API traffic to local `8787`.
- Do not run the Vite dev server on the public server.
- Do not open `8787` in the cloud firewall.

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
Environment='ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"}]'
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

## 5. Install And Configure Caddy

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

## 6. Validate From Outside The Server

From your Windows machine:

```powershell
curl.exe https://signal-47-86-100-51.sslip.io/health
```

Then open:

- Camera phone: `https://app-47-86-100-51.sslip.io/?mode=camera`
- Viewer phone: `https://app-47-86-100-51.sslip.io/?mode=viewer`

Use the old phone as the camera. Use mobile data on the viewer phone for the
real outside-network test.

## Expected Failure That Means TURN Is Needed

If both HTTPS pages load, the room and PIN work, but the viewer video stays
black or stuck on connecting from mobile data, the HTTPS/signaling deployment is
working and the next missing piece is TURN. Add coturn later and replace
`ICE_SERVERS_JSON` with STUN plus TURN credentials.
