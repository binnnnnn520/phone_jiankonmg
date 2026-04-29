export type BatterySnapshot =
  | {
      available: true;
      charging: boolean;
      level: number;
    }
  | {
      available: false;
    };

export interface BatteryManagerLike {
  charging: boolean;
  level: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export type NavigatorBatteryLike = Partial<Navigator> & {
  getBattery?: () => Promise<BatteryManagerLike>;
};

const UNAVAILABLE_SNAPSHOT: BatterySnapshot = { available: false };
const LOW_BATTERY_THRESHOLD = 0.2;

export function formatBatterySnapshot(snapshot: BatterySnapshot): string {
  if (!snapshot.available) return "Battery unavailable";

  const percent = `${Math.round(normalizeLevel(snapshot.level) * 100)}%`;
  if (snapshot.charging) return `Charging ${percent}`;
  if (snapshot.level <= LOW_BATTERY_THRESHOLD) return `Battery low ${percent}`;
  return `Battery ${percent}`;
}

export async function readBatterySnapshot(
  navigatorLike: NavigatorBatteryLike = defaultNavigator()
): Promise<BatterySnapshot> {
  if (typeof navigatorLike.getBattery !== "function") {
    return UNAVAILABLE_SNAPSHOT;
  }

  try {
    return snapshotFromBattery(await navigatorLike.getBattery());
  } catch {
    return UNAVAILABLE_SNAPSHOT;
  }
}

export async function watchBatterySnapshot(
  navigatorLike: NavigatorBatteryLike,
  callback: (snapshot: BatterySnapshot) => void
): Promise<() => void> {
  if (typeof navigatorLike.getBattery !== "function") {
    callback(UNAVAILABLE_SNAPSHOT);
    return () => undefined;
  }

  let battery: BatteryManagerLike;
  try {
    battery = await navigatorLike.getBattery();
  } catch {
    callback(UNAVAILABLE_SNAPSHOT);
    return () => undefined;
  }

  const emit = () => callback(snapshotFromBattery(battery));
  battery.addEventListener?.("levelchange", emit);
  battery.addEventListener?.("chargingchange", emit);
  emit();

  return () => {
    battery.removeEventListener?.("levelchange", emit);
    battery.removeEventListener?.("chargingchange", emit);
  };
}

function snapshotFromBattery(battery: BatteryManagerLike): BatterySnapshot {
  return {
    available: true,
    charging: battery.charging,
    level: normalizeLevel(battery.level)
  };
}

function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

function defaultNavigator(): NavigatorBatteryLike {
  return (
    globalThis as typeof globalThis & { navigator?: NavigatorBatteryLike }
  ).navigator ?? {};
}
