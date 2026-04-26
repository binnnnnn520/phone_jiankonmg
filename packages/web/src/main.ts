import "./styles.css";
import { renderCamera } from "./camera.js";
import { resolveRoute } from "./routes.js";
import { renderViewer } from "./viewer.js";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
if (!appRoot) throw new Error("Missing app root");

function navigate(search: string): void {
  window.history.pushState({}, "", search);
  renderApp();
}

function renderHome(): void {
  appRoot.innerHTML = `
    <section class="app-shell home-shell">
      <header class="screen-header">
        <p class="eyebrow">Phone Monitor</p>
        <h1>Remote Live View</h1>
      </header>
      <p class="status">Start a visible camera session or join one with a room link and PIN.</p>
      <div class="actions">
        <button id="camera" type="button">Use this phone as camera</button>
        <button id="viewer" type="button">Watch a camera</button>
      </div>
    </section>
  `;
  appRoot.querySelector("#camera")?.addEventListener("click", () => navigate("/?mode=camera"));
  appRoot.querySelector("#viewer")?.addEventListener("click", () => navigate("/?mode=viewer"));
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
