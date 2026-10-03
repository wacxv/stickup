/**
 * settingsIO.ts
 *
 * Read / write settings.json in the Tauri appData directory.
 *
 * If the file is missing or corrupt, DEFAULT_SETTINGS is returned and
 * written to disk so future reads succeed.
 */

import {
  readTextFile,
  writeTextFile,
  exists,
} from "@tauri-apps/plugin-fs";
import type { Settings } from "../types/settings";
import { storagePath } from "./storage";

const SETTINGS_PATH = "settings.json";

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  launchAtStartup: false,
  startupVisibility: "shown",
  windowBounds: null,
  lastOpenPane: "notes",
  defaultNotificationMode: "gentle",
  reminderLeadMinutes: 30,
  nagIntervalMinutes: 15,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load settings from disk.  Falls back to defaults on any error and
 * persists them so the file exists for next time.
 */
export async function readSettings(): Promise<Settings> {
  try {
    const settingsPath = await storagePath(SETTINGS_PATH);
    if (!(await exists(settingsPath))) {
      await writeSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }

    const raw = await readTextFile(settingsPath);
    const parsed = JSON.parse(raw) as Partial<Settings>;

    // Merge with defaults so new fields added in future versions always
    // have a value even if the user's settings.json pre-dates them.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.warn("[settingsIO] Failed to read settings, using defaults:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist settings to disk.  Writes the full object every time —
 * settings.json is small enough that partial patching adds no value.
 */
export async function writeSettings(settings: Settings): Promise<void> {
  const json = JSON.stringify(settings, null, 2);
  await writeTextFile(await storagePath(SETTINGS_PATH), json);
}

/**
 * Convenience: apply a partial patch and write in one call.
 * Returns the merged Settings object.
 */
export async function patchSettings(
  current: Settings,
  patch: Partial<Settings>,
): Promise<Settings> {
  const next: Settings = { ...current, ...patch };
  await writeSettings(next);
  return next;
}
