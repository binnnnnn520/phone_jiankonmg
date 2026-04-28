import "./styles.css";
import type { ConnectionMode } from "@phone-monitor/shared";
import type { ViewerPairedCamera } from "@phone-monitor/shared";
import { getPairStatus } from "./api.js";
import { renderCamera } from "./camera.js";
import {
  browserConnectionModeStorage,
  parseConnectionMode,
  resolvePreferredConnectionMode,
  storeConnectionMode
} from "./connection-mode.js";
import { loadClientConfig } from "./config.js";
import { buildHomeMarkup, parseHomeTab, type HomeTab } from "./home.js";
import {
  browserPairStorage,
  clearPairedCamera,
  readPairedCameras
} from "./paired-cameras.js";
import { resolveRoute } from "./routes.js";
import { renderViewer } from "./viewer.js";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
if (!appRoot) throw new Error("Missing app root");

function navigate(search: string): void {
  window.history.pushState({}, "", search);
  renderApp();
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

function refreshPairStatuses(pairedCameras: ViewerPairedCamera[]): void {
  if (pairedCameras.length === 0) return;
  const config = loadClientConfig();
  for (const camera of pairedCameras) {
    void getPairStatus(config, camera)
      .then((status) => {
        updatePairStatus(camera.pairId, status.status === "live" ? "Live" : "Offline");
      })
      .catch(() => {
        updatePairStatus(camera.pairId, "Offline");
      });
  }
}

function updatePairStatus(pairId: string, label: string): void {
  const status = Array.from(
    appRoot.querySelectorAll<HTMLElement>("[data-pair-status]")
  ).find((element) => element.dataset.pairStatus === pairId);
  if (status) status.textContent = label;
}

function renderHome(): void {
  const activeTab = selectedHomeTab();
  const pairStorage = browserPairStorage();
  const pairedCameras = readPairedCameras(pairStorage);
  appRoot.innerHTML = buildHomeMarkup(
    selectedConnectionMode(),
    activeTab,
    pairedCameras
  );
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
  appRoot
    .querySelector("#camera")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("camera")));
  appRoot
    .querySelector("#viewer")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("viewer")));
  if (activeTab === "cameras") refreshPairStatuses(pairedCameras);
}

function renderApp(): void {
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
