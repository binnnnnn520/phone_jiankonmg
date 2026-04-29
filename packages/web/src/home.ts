import type { ConnectionMode, ViewerPairedCamera } from "@phone-monitor/shared";
import {
  filterPairedCameras,
  sortPairedCameras,
  type PairedCameraStatus,
  type PairedCameraStatusLookup
} from "./paired-cameras.js";

export type HomeTab = "home" | "cameras" | "me";

export interface HomeMarkupOptions {
  pairStatuses?: PairedCameraStatusLookup;
  cameraSearchQuery?: string;
}

interface PairedCameraListOptions {
  pairStatuses?: PairedCameraStatusLookup;
  cameraSearchQuery?: string;
}

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

export function buildPairedCameraList(
  pairedCameras: ViewerPairedCamera[],
  options: PairedCameraListOptions = {}
): string {
  if (pairedCameras.length === 0) {
    return `
      <section class="paired-camera-empty">
        <h2>No paired cameras yet</h2>
        <p>Pair once with QR and PIN, then reconnect here next time.</p>
      </section>
    `;
  }

  return `
      ${buildCameraSearch(options.cameraSearchQuery ?? "")}
      <div data-paired-camera-list-region>
        ${buildPairedCameraListBody(pairedCameras, options)}
      </div>
  `;
}

export function buildPairedCameraListBody(
  pairedCameras: ViewerPairedCamera[],
  options: PairedCameraListOptions = {}
): string {
  const sortedCameras = sortPairedCameras(pairedCameras, options.pairStatuses);
  const filteredCameras = filterPairedCameras(
    sortedCameras,
    options.cameraSearchQuery ?? ""
  );

  if (filteredCameras.length === 0) {
    return `
      <section class="paired-camera-empty" aria-live="polite">
        <h2>No matching cameras</h2>
        <p>Try another saved camera name.</p>
      </section>
    `;
  }

  return `
      <section class="paired-camera-list" aria-label="Paired cameras">
        ${filteredCameras
          .map((camera) =>
            buildPairedCameraItem(
              camera,
              options.pairStatuses?.[camera.pairId] ?? "checking"
            )
          )
          .join("")}
      </section>
  `;
}

function buildCameraSearch(query: string): string {
  return `
      <section class="paired-camera-controls" aria-label="Camera list controls">
        <label class="camera-search-field">
          <span>Search cameras</span>
          <input type="search" value="${escapeHtml(query)}" autocomplete="off" data-camera-search />
        </label>
      </section>
  `;
}

function buildPairedCameraItem(
  camera: ViewerPairedCamera,
  status: PairedCameraStatus
): string {
  const statusLabel = formatPairStatus(status);
  return `
        <article class="paired-camera-card">
          <div>
            <h2>${escapeHtml(camera.displayName)}</h2>
            <p>Last connected ${formatLastConnected(camera.lastConnectedAt)}</p>
            <p class="pair-status pair-status-${status}" data-pair-status="${escapeHtml(camera.pairId)}">${statusLabel}</p>
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

function buildConnectionSummary(pairedCameras: ViewerPairedCamera[]): string {
  const savedCount = pairedCameras.length;
  const statusLabel = savedCount === 0 ? "No saved cameras" : "Checking status";
  const liveCount = savedCount === 0 ? "0" : "Checking";
  const offlineCount = savedCount === 0 ? "0" : "Checking";

  return `
      <section class="connection-summary" aria-label="Connection status">
        <div class="connection-summary-header">
          <h2>Your connections</h2>
          <span data-connection-summary-state>${statusLabel}</span>
        </div>
        <div class="connection-summary-grid">
          <span>
            <small>Saved</small>
            <strong data-connection-count="saved">${savedCount}</strong>
          </span>
          <span>
            <small>Live</small>
            <strong data-connection-count="live">${liveCount}</strong>
          </span>
          <span>
            <small>Offline</small>
            <strong data-connection-count="offline">${offlineCount}</strong>
          </span>
        </div>
      </section>
  `;
}

function buildCameraNameEditor(cameraDisplayName: string): string {
  return `
      <section class="camera-name-card" aria-label="Camera name settings">
        <label class="camera-name-field">
          <span>Camera name</span>
          <input type="text" value="${escapeHtml(cameraDisplayName)}" maxlength="40" autocomplete="off" data-camera-name-input />
        </label>
        <button class="ghost-outline" type="button" data-camera-name-save>Save name</button>
        <p class="camera-name-status" role="status" data-camera-name-status></p>
      </section>
  `;
}

function buildTabContent(
  selectedMode: ConnectionMode,
  activeTab: HomeTab,
  pairedCameras: ViewerPairedCamera[],
  cameraDisplayName: string,
  options: HomeMarkupOptions = {}
): string {
  if (activeTab === "cameras") {
    return `
      ${buildHomeHeader("Cameras", "Choose how this phone participates.")}
      ${buildPairedCameraList(pairedCameras, options)}
      ${buildActionCards()}
    `;
  }

  if (activeTab === "me") {
    return `
      ${buildHomeHeader("Me", "Personal settings for this phone.")}
      ${buildConnectionSummary(pairedCameras)}
      ${buildCameraNameEditor(cameraDisplayName)}
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
  pairedCameras: ViewerPairedCamera[] = [],
  cameraDisplayName = "This phone camera",
  options: HomeMarkupOptions = {}
): string {
  return `
    <section class="app-shell home-shell light-monitor-shell">
      <div class="home-tab-content" data-active-home-tab="${activeTab}">
        ${buildTabContent(
          selectedMode,
          activeTab,
          pairedCameras,
          cameraDisplayName,
          options
        )}
      </div>
      ${buildBottomNav(activeTab)}
    </section>
  `;
}

function formatLastConnected(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "recently";
  return "recently";
}

function formatPairStatus(status: PairedCameraStatus): string {
  if (status === "live") return "Live";
  if (status === "offline") return "Offline";
  return "Checking";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
