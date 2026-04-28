import type { ConnectionMode, ViewerPairedCamera } from "@phone-monitor/shared";

export type HomeTab = "home" | "cameras" | "me";

function buildModeButton(
  mode: ConnectionMode,
  label: string,
  selectedMode: ConnectionMode
): string {
  const selected = mode === selectedMode;
  const className = selected
    ? "mode-option mode-option-selected"
    : "mode-option";
  return `<button class="${className}" type="button" data-connection-mode="${mode}" aria-pressed="${selected}">${label}</button>`;
}

function buildBottomNav(activeTab: HomeTab): string {
  return `
      <nav class="bottom-nav" aria-label="Primary">
        ${buildBottomNavButton("home", "Home", activeTab)}
        ${buildBottomNavButton("cameras", "Cameras", activeTab)}
        ${buildBottomNavButton("me", "Me", activeTab)}
      </nav>
  `;
}

function buildBottomNavButton(
  tab: HomeTab,
  label: string,
  activeTab: HomeTab
): string {
  const active = tab === activeTab;
  const className = active ? "bottom-nav-item active" : "bottom-nav-item";
  const ariaCurrent = active ? ' aria-current="page"' : "";
  return `<button class="${className}" type="button" data-home-tab="${tab}"${ariaCurrent}>${label}</button>`;
}

function buildHomeHeader(title: string, copy: string): string {
  return `
      <header class="home-header">
        <div class="brand-row">
          <span class="brand-mark" aria-hidden="true"></span>
          <p class="eyebrow">Phone Monitor</p>
        </div>
        <div class="home-title-block">
          <h1>${title}</h1>
          <p class="home-copy">${copy}</p>
        </div>
        <div class="home-status-strip" aria-label="Monitoring summary">
          <span><strong>Quick pair</strong><small>QR + PIN</small></span>
          <span><strong>Live view</strong><small>Second phone</small></span>
          <span><strong>Private</strong><small>Your devices</small></span>
        </div>
      </header>
  `;
}

function buildActionCards(): string {
  return `
      <div class="home-actions">
        <button class="action-card camera-card primary-action" id="camera" type="button">
          <span class="action-illustration camera-illustration" aria-hidden="true"></span>
          <span class="action-text">
            <span class="action-kicker">Camera phone</span>
            <span class="action-label">Use this phone as camera</span>
            <span class="action-detail">Shows QR and PIN for pairing.</span>
          </span>
          <span class="action-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button class="action-card viewer-card secondary-action" id="viewer" type="button">
          <span class="action-illustration viewer-illustration" aria-hidden="true"></span>
          <span class="action-text">
            <span class="action-kicker">Viewer phone</span>
            <span class="action-label">Watch a camera</span>
            <span class="action-detail">Scan QR or reconnect a saved camera.</span>
          </span>
          <span class="action-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </div>
  `;
}

function buildPairedCameraList(pairedCameras: ViewerPairedCamera[]): string {
  if (pairedCameras.length === 0) {
    return `
      <section class="paired-camera-empty">
        <h2>No paired cameras yet</h2>
        <p>Pair once with QR and PIN, then reconnect here next time.</p>
      </section>
    `;
  }

  return `
      <section class="paired-camera-list" aria-label="Paired cameras">
        ${pairedCameras.map(buildPairedCameraItem).join("")}
      </section>
  `;
}

function buildPairedCameraItem(camera: ViewerPairedCamera): string {
  return `
        <article class="paired-camera-card">
          <div>
            <h2>${escapeHtml(camera.displayName)}</h2>
            <p>Last connected ${formatLastConnected(camera.lastConnectedAt)}</p>
            <p class="pair-status" data-pair-status="${escapeHtml(camera.pairId)}">Checking</p>
          </div>
          <div class="paired-camera-actions">
            <button class="ghost-outline" type="button" data-reconnect-pair="${escapeHtml(camera.pairId)}">Reconnect</button>
            <button class="text-danger" type="button" data-remove-pair="${escapeHtml(camera.pairId)}">Remove</button>
          </div>
        </article>
  `;
}

function buildConnectionPicker(selectedMode: ConnectionMode): string {
  return `
      <section class="connection-picker" aria-label="Connection mode">
        <p class="connection-title">Connect using</p>
        <div class="mode-options">
          ${buildModeButton("nearby", "Same Wi-Fi", selectedMode)}
          ${buildModeButton("remote", "Remote", selectedMode)}
        </div>
      </section>
  `;
}

function buildTabContent(
  selectedMode: ConnectionMode,
  activeTab: HomeTab,
  pairedCameras: ViewerPairedCamera[]
): string {
  if (activeTab === "cameras") {
    return `
      ${buildHomeHeader("Cameras", "Choose how this phone participates.")}
      ${buildPairedCameraList(pairedCameras)}
      ${buildActionCards()}
    `;
  }

  if (activeTab === "me") {
    return `
      ${buildHomeHeader("Me", "Personal settings for this phone.")}
      ${buildConnectionPicker(selectedMode)}
      <p class="home-note">Keep both phones charged and on the app.</p>
    `;
  }

  return `
      ${buildHomeHeader("Two phones, live view", "Use an old phone as a visible camera.")}
      ${buildActionCards()}
      ${buildConnectionPicker(selectedMode)}
      <p class="home-note">Keep both phones charged and on the app.</p>
  `;
}

export function parseHomeTab(value: string | null | undefined): HomeTab {
  if (value === "cameras" || value === "me") return value;
  return "home";
}

export function buildHomeMarkup(
  selectedMode: ConnectionMode = "remote",
  activeTab: HomeTab = "home",
  pairedCameras: ViewerPairedCamera[] = []
): string {
  return `
    <section class="app-shell home-shell light-monitor-shell">
      ${buildTabContent(selectedMode, activeTab, pairedCameras)}
      ${buildBottomNav(activeTab)}
    </section>
  `;
}

function formatLastConnected(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "recently";
  return "recently";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
