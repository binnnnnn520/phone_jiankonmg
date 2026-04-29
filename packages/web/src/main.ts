import "./styles.css";
import type { ConnectionMode } from "@phone-monitor/shared";
import type { ViewerPairedCamera } from "@phone-monitor/shared";
import { getPairStatus } from "./api.js";
import {
  formatBatterySnapshot,
  watchBatterySnapshot
} from "./battery-status.js";
import { renderCamera } from "./camera.js";
import {
  browserConnectionModeStorage,
  parseConnectionMode,
  resolvePreferredConnectionMode,
  storeConnectionMode
} from "./connection-mode.js";
import { loadClientConfig } from "./config.js";
import {
  buildHomeMarkup,
  buildPairedCameraListBody,
  parseHomeTab,
  type HomeTab
} from "./home.js";
import {
  browserPairStorage,
  clearPairedCamera,
  readCameraDisplayName,
  readPairedCameras,
  saveCameraDisplayName,
  type PairedCameraStatus,
  type PairedCameraStatusLookup
} from "./paired-cameras.js";
import { resolveRoute } from "./routes.js";
import {
  browserVideoQualityStorage,
  parseVideoQuality,
  readVideoQuality,
  saveVideoQuality
} from "./video-quality.js";
import { renderViewer } from "./viewer.js";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
if (!appRoot) throw new Error("Missing app root");
const PAIR_STATUS_REFRESH_MS = 5000;
let pairStatusRefreshTimer: number | undefined;
let homeBatteryStatusCleanup: (() => void) | undefined;
let homeBatteryStatusWatchVersion = 0;
const pairStatusByPairId: PairedCameraStatusLookup = {};
let cameraSearchQuery = "";

function navigate(search: string): void {
  window.history.pushState({}, "", search);
  renderApp();
}

function stopPairStatusRefresh(): void {
  if (pairStatusRefreshTimer) {
    window.clearInterval(pairStatusRefreshTimer);
    pairStatusRefreshTimer = undefined;
  }
}

function stopHomeBatteryStatusWatch(): void {
  homeBatteryStatusWatchVersion += 1;
  homeBatteryStatusCleanup?.();
  homeBatteryStatusCleanup = undefined;
}

function startHomeBatteryStatusWatch(): void {
  const batteryStatus = appRoot.querySelector<HTMLElement>("[data-battery-status]");
  if (!batteryStatus) return;

  const watchVersion = homeBatteryStatusWatchVersion;
  void watchBatterySnapshot(navigator, (snapshot) => {
    if (
      watchVersion === homeBatteryStatusWatchVersion &&
      appRoot.contains(batteryStatus)
    ) {
      batteryStatus.textContent = formatBatterySnapshot(snapshot);
    }
  }).then((cleanup) => {
    if (
      watchVersion !== homeBatteryStatusWatchVersion ||
      !appRoot.contains(batteryStatus)
    ) {
      cleanup();
      return;
    }
    homeBatteryStatusCleanup = cleanup;
  });
}

function selectedConnectionMode(): ConnectionMode {
  return resolvePreferredConnectionMode({
    storage: browserConnectionModeStorage(),
    configuredMode: "auto"
  });
}

function routeWithConnectionMode(mode: "camera" | "viewer"): string {
  return `/?${new URLSearchParams({
    mode,
    connection: selectedConnectionMode()
  }).toString()}`;
}

function routeWithPairReconnect(pairId: string): string {
  return `/?${new URLSearchParams({
    mode: "viewer",
    pair: pairId,
    connection: selectedConnectionMode()
  }).toString()}`;
}

function selectedHomeTab(): HomeTab {
  return parseHomeTab(new URLSearchParams(window.location.search).get("tab"));
}

function routeWithHomeTab(tab: HomeTab): string {
  if (tab === "home") return "/";
  return `/?${new URLSearchParams({ tab }).toString()}`;
}

function refreshPairStatuses(
  pairedCameras: ViewerPairedCamera[],
  options: { rerenderCameraList?: boolean } = {}
): void {
  if (pairedCameras.length === 0) {
    updateConnectionSummary(0, 0);
    return;
  }
  const config = loadClientConfig();
  void Promise.all(
    pairedCameras.map((camera) =>
      getPairStatus(config, camera)
      .then((status) => {
        const pairStatus: PairedCameraStatus =
          status.status === "live" ? "live" : "offline";
        pairStatusByPairId[camera.pairId] = pairStatus;
        updatePairStatus(camera.pairId, pairStatus);
        return pairStatus;
      })
      .catch(() => {
        pairStatusByPairId[camera.pairId] = "offline";
        updatePairStatus(camera.pairId, "offline");
        return "offline" as const;
      })
    )
  ).then((statuses) => {
    const liveCount = statuses.filter((status) => status === "live").length;
    updateConnectionSummary(liveCount, statuses.length - liveCount);
    if (options.rerenderCameraList) renderPairedCameraList(browserPairStorage());
  });
}

function updatePairStatus(pairId: string, status: PairedCameraStatus): void {
  const element = Array.from(
    appRoot.querySelectorAll<HTMLElement>("[data-pair-status]")
  ).find((element) => element.dataset.pairStatus === pairId);
  if (!element) return;

  element.textContent = pairStatusLabel(status);
  element.className = `pair-status pair-status-${status}`;
}

function updateConnectionSummary(liveCount: number, offlineCount: number): void {
  const live = appRoot.querySelector<HTMLElement>('[data-connection-count="live"]');
  const offline = appRoot.querySelector<HTMLElement>('[data-connection-count="offline"]');
  const state = appRoot.querySelector<HTMLElement>("[data-connection-summary-state]");
  if (live) live.textContent = String(liveCount);
  if (offline) offline.textContent = String(offlineCount);
  if (state) {
    state.textContent =
      liveCount > 0
        ? `${liveCount} live now`
        : offlineCount > 0
          ? "All offline"
          : "No saved cameras";
  }
}

function pairStatusLabel(status: PairedCameraStatus): string {
  if (status === "live") return "Live";
  if (status === "offline") return "Offline";
  return "Checking";
}

function bindPairedCameraActions(pairStorage: Storage | undefined): void {
  appRoot
    .querySelectorAll<HTMLButtonElement>("[data-reconnect-pair]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const pairId = button.dataset.reconnectPair;
        if (pairId) navigate(routeWithPairReconnect(pairId));
      });
    });
  appRoot.querySelectorAll<HTMLButtonElement>("[data-remove-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      const pairId = button.dataset.removePair;
      if (!pairId) return;
      clearPairedCamera(pairStorage, pairId);
      renderHome();
    });
  });
}

function renderPairedCameraList(pairStorage: Storage | undefined): void {
  const region = appRoot.querySelector<HTMLElement>("[data-paired-camera-list-region]");
  if (!region) return;

  region.innerHTML = buildPairedCameraListBody(readPairedCameras(pairStorage), {
    pairStatuses: pairStatusByPairId,
    cameraSearchQuery
  });
  bindPairedCameraActions(pairStorage);
}

function renderHome(): void {
  stopPairStatusRefresh();
  stopHomeBatteryStatusWatch();
  const activeTab = selectedHomeTab();
  const pairStorage = browserPairStorage();
  const videoQualityStorage = browserVideoQualityStorage();
  const pairedCameras = readPairedCameras(pairStorage);
  appRoot.innerHTML = buildHomeMarkup(
    selectedConnectionMode(),
    activeTab,
    pairedCameras,
    readCameraDisplayName(pairStorage),
    {
      pairStatuses: pairStatusByPairId,
      cameraSearchQuery,
      selectedVideoQuality: readVideoQuality(videoQualityStorage)
    }
  );
  startHomeBatteryStatusWatch();
  appRoot
    .querySelectorAll<HTMLButtonElement>("[data-connection-mode]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = parseConnectionMode(button.dataset.connectionMode);
        if (!mode) return;
        storeConnectionMode(browserConnectionModeStorage(), mode);
        renderHome();
      });
    });
  appRoot.querySelectorAll<HTMLButtonElement>("[data-home-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = parseHomeTab(button.dataset.homeTab);
      navigate(routeWithHomeTab(tab));
    });
  });
  bindPairedCameraActions(pairStorage);
  appRoot.querySelector<HTMLInputElement>("[data-camera-search]")?.addEventListener(
    "input",
    (event) => {
      cameraSearchQuery = (event.currentTarget as HTMLInputElement).value;
      renderPairedCameraList(pairStorage);
    }
  );
  appRoot
    .querySelector<HTMLButtonElement>("[data-camera-name-save]")
    ?.addEventListener("click", () => {
      const input = appRoot.querySelector<HTMLInputElement>("[data-camera-name-input]");
      const status = appRoot.querySelector<HTMLElement>("[data-camera-name-status]");
      const savedName = saveCameraDisplayName(pairStorage, input?.value ?? "");
      if (input) input.value = savedName;
      if (status) status.textContent = "Name saved";
    });
  appRoot
    .querySelectorAll<HTMLButtonElement>("[data-video-quality]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const quality = parseVideoQuality(button.dataset.videoQuality);
        if (!quality) return;
        saveVideoQuality(videoQualityStorage, quality);
        renderHome();
      });
    });
  appRoot
    .querySelector("#camera")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("camera")));
  appRoot
    .querySelector("#viewer")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("viewer")));
  if (activeTab === "cameras" || activeTab === "me") {
    refreshPairStatuses(pairedCameras, { rerenderCameraList: activeTab === "cameras" });
    pairStatusRefreshTimer = window.setInterval(
      () =>
        refreshPairStatuses(pairedCameras, {
          rerenderCameraList: selectedHomeTab() === "cameras"
        }),
      PAIR_STATUS_REFRESH_MS
    );
  }
}

function renderApp(): void {
  stopPairStatusRefresh();
  stopHomeBatteryStatusWatch();
  const route = resolveRoute(new URLSearchParams(window.location.search));
  if (route === "camera") {
    void renderCamera(appRoot, { onBack: () => navigate("/") });
    return;
  }
  if (route === "viewer") {
    renderViewer(appRoot, { onBack: () => navigate("/") });
    return;
  }
  renderHome();
}

window.addEventListener("popstate", renderApp);
renderApp();
