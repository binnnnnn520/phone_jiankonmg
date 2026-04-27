import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(packageRoot, "../..");
const viteEntry = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

function readBuiltText(dir: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(entry.parentPath, entry.name);
    if (/\.(html|js|css|webmanifest)$/.test(fullPath)) {
      chunks.push(readFileSync(fullPath, "utf8"));
    }
  }
  return chunks.join("\n");
}

test("production build embeds public signaling URLs", () => {
  const outDir = path.join(packageRoot, "dist-config-test");
  rmSync(outDir, { recursive: true, force: true });

  execFileSync(process.execPath, [viteEntry, "build", "--outDir", outDir], {
    cwd: packageRoot,
    env: {
      ...process.env,
      VITE_SIGNALING_HTTP_URL: "https://signal-47-86-100-51.sslip.io",
      VITE_SIGNALING_WS_URL: "wss://signal-47-86-100-51.sslip.io/ws",
      VITE_PUBLIC_VIEWER_URL: "https://app-47-86-100-51.sslip.io/"
    },
    stdio: "pipe"
  });

  assert.equal(existsSync(outDir), true);
  const builtText = readBuiltText(outDir);
  assert.match(builtText, /signal-47-86-100-51\.sslip\.io/);
  assert.doesNotMatch(builtText, /import\.meta\.env/);

  rmSync(outDir, { recursive: true, force: true });
});
