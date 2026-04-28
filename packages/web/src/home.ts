import type { ConnectionMode } from "@phone-monitor/shared";

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
        <h1>${title}</h1>
        <p class="home-copy">${copy}</p>
      </header>
  `;
}

function buildActionCards(): string {
  return `
      <div class="home-actions">
        <button class="action-card camera-card" id="camera" type="button">
          <span class="action-illustration camera-illustration" aria-hidden="true"></span>
          <span class="action-label">Use this phone as camera</span>
          <span class="action-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button class="action-card viewer-card" id="viewer" type="button">
          <span class="action-illustration viewer-illustration" aria-hidden="true"></span>
          <span class="action-label">Watch a camera</span>
          <span class="action-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </div>
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
  activeTab: HomeTab
): string {
  if (activeTab === "cameras") {
    return `
      ${buildHomeHeader("Cameras", "Choose how this phone participates.")}
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
  activeTab: HomeTab = "home"
): string {
  return `
    <section class="app-shell home-shell">
      ${buildTabContent(selectedMode, activeTab)}
      ${buildBottomNav(activeTab)}
    </section>
  `;
}
