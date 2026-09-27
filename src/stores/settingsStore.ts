/**
 * settingsStore.ts
 *
 * Zustand store for app-level settings.
 *
 * On first access the store loads from disk via settingsIO.
 * Any mutation immediately persists back to settings.json.
 */

import { create } from "zustand";
import type { Settings } from "../types/settings";
import type { WindowBounds } from "../types/settings";
import {
  DEFAULT_SETTINGS,
  patchSettings,
  readSettings,
  writeSettings,
} from "../lib/settingsIO";

// ─── State shape ──────────────────────────────────────────────────────────────

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  error: string | null;
}

interface SettingsActions {
  /** Load settings from disk. Call once on app start. */
  loadSettings(): Promise<void>;

  /** Replace the full settings object and persist. */
  saveSettings(settings: Settings): Promise<void>;

  /** Apply a partial patch and persist. */
  updateSettings(patch: Partial<Settings>): Promise<void>;

  /** Persist the current window position/size. Called on window move/resize. */
  saveWindowBounds(bounds: WindowBounds): Promise<void>;
}

export type SettingsStore = SettingsState & SettingsActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  // Start with defaults synchronously so the UI never sees undefined values
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  error: null,

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  async loadSettings() {
    try {
      const settings = await readSettings();
      set({ settings, loaded: true, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[settingsStore] loadSettings failed:", err);
      set({ loaded: true, error: msg });
    }
  },

  // ── Mutations ──────────────────────────────────────────────────────────────
  async saveSettings(settings) {
    await writeSettings(settings);
    set({ settings, error: null });
  },

  async updateSettings(patch) {
    const { settings } = get();
    try {
      const next = await patchSettings(settings, patch);
      set({ settings: next, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[settingsStore] updateSettings failed:", err);
      set({ error: msg });
    }
  },

  async saveWindowBounds(bounds) {
    // Convenience wrapper — called frequently on resize, so we skip the
    // full patchSettings round-trip and write directly to avoid stale reads.
    const { settings } = get();
    const next: Settings = { ...settings, windowBounds: bounds };
    try {
      await writeSettings(next);
      set({ settings: next });
    } catch (err) {
      // Non-critical — swallow silently rather than surfacing to the user
      console.warn("[settingsStore] saveWindowBounds failed:", err);
    }
  },
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

export function selectSettings(state: SettingsStore): Settings {
  return state.settings;
}
