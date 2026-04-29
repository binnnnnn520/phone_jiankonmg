import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBatterySnapshot,
  readBatterySnapshot,
  watchBatterySnapshot,
  type BatterySnapshot
} from "../src/battery-status.js";

test("formatBatterySnapshot shows charging percentage", () => {
  const snapshot: BatterySnapshot = {
    available: true,
    charging: true,
    level: 0.83
  };

  assert.equal(formatBatterySnapshot(snapshot), "Charging 83%");
});

test("formatBatterySnapshot calls out low battery when unplugged", () => {
  const snapshot: BatterySnapshot = {
    available: true,
    charging: false,
    level: 0.18
  };

  assert.equal(formatBatterySnapshot(snapshot), "Battery low 18%");
});

test("readBatterySnapshot formats unsupported browsers as unavailable", async () => {
  const snapshot = await readBatterySnapshot({});

  assert.equal(formatBatterySnapshot(snapshot), "Battery unavailable");
});

test("watchBatterySnapshot reports updates and removes listeners on cleanup", async () => {
  const listeners: Record<string, () => void> = {};
  const removed: string[] = [];
  const battery = {
    charging: false,
    level: 0.5,
    addEventListener(type: string, listener: () => void) {
      listeners[type] = listener;
    },
    removeEventListener(type: string) {
      removed.push(type);
      delete listeners[type];
    }
  };
  const labels: string[] = [];

  const cleanup = await watchBatterySnapshot(
    { getBattery: async () => battery },
    (snapshot) => labels.push(formatBatterySnapshot(snapshot))
  );

  assert.deepEqual(labels, ["Battery 50%"]);

  battery.level = 0.18;
  listeners.levelchange?.();

  assert.deepEqual(labels, ["Battery 50%", "Battery low 18%"]);

  cleanup();
  battery.charging = true;
  listeners.chargingchange?.();

  assert.deepEqual(removed.sort(), ["chargingchange", "levelchange"]);
  assert.deepEqual(labels, ["Battery 50%", "Battery low 18%"]);
});
