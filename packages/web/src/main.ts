import "./styles.css";
import type { ConnectionMode } from "@phone-monitor/shared";
import { renderCamera } from "./camera.js";
import {
  browserConnectionModeStorage,
  parseConnectionMode,
  resolvePreferredConnectionMode,
  storeConnectionMode
} from "./connection-mode.js";
import { buildHomeMarkup, parseHomeTab, type HomeTab } from "./home.js";
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

function selectedHomeTab(): HomeTab {
  return parseHomeTab(new URLSearchParams(window.location.search).get("tab"));
}

function routeWithHomeTab(tab: HomeTab): string {
  if (tab === "home") return "/";
  return `/?${new URLSearchParams({ tab }).toString()}`;
}

function renderHome(): void {
  const activeTab = selectedHomeTab();
  appRoot.innerHTML = buildHomeMarkup(selectedConnectionMode(), activeTab);
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
    .querySelector("#camera")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("camera")));
  appRoot
    .querySelector("#viewer")
    ?.addEventListener("click", () => navigate(routeWithConnectionMode("viewer")));
}

function renderApp(): void {
  const route = resolveRoute(new URLSearchParams(window.location.search));
  if (route === "camera") {
    void renderCamera(appRoot);
    return;
  }
  if (route === "viewer") {
    renderViewer(appRoot);
    return;
  }
  renderHome();
}

window.addEventListener("popstate", renderApp);
renderApp();
