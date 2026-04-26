import { defineConfig, devices } from "@playwright/test";

function npmRun(script: string): string {
  if (process.platform !== "win32") return `npm run ${script}`;
  return [
    "cmd /c",
    `"call D:\\APP\\anaconda\\Scripts\\activate.bat jiankong_app`,
    `&& npm.cmd run ${script}"`
  ].join(" ");
}

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Desktop Chrome"],
    channel: "chrome",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream"
      ]
    }
  },
  webServer: [
    {
      command: npmRun("dev:server"),
      url: "http://localhost:8787/health",
      reuseExistingServer: true
    },
    {
      command: npmRun("dev:web"),
      url: "http://localhost:5173",
      reuseExistingServer: true
    }
  ]
});
