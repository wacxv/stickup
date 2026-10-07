/**
 * SettingsPane
 *
 * Full-screen overlay showing all user-configurable settings.
 * Mounts on top of the board UI when the gear icon is clicked.
 *
 * Settings persisted here:
 *   - launchAtStartup  (also syncs with tauri-plugin-autostart)
 *   - startupVisibility
 *   - defaultNotificationMode
 *   - reminderLeadMinutes
 *   - nagIntervalMinutes
 *
 * windowBounds is managed silently by the app on resize/move — not shown here.
 */

import { useState } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useSettingsStore } from "../stores/settingsStore";
import type { NotificationMode } from "../types/task";
import type { StartupVisibility } from "../types/settings";
import { ensureNotificationPermission } from "../lib/notificationService";
import { triggerBackgroundTimer } from "../lib/backgroundTimer";
import { checkForUpdates, RELEASES_URL } from "../lib/updateCheck";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FiX } from "react-icons/fi";

interface Props {
  onClose: () => void;
}

export function SettingsPane({ onClose }: Props) {
  const { settings, updateSettings } = useSettingsStore();

  // Local draft state so we don't write on every keystroke
  const [draft, setDraft] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "available" | "up-to-date" | "no-releases" | "error"
  >("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSettings(draft);

      // If notifications are active, ensure the OS permission is granted
      if (draft.defaultNotificationMode) {
        await ensureNotificationPermission();
      }

      // Sync autostart with the OS via tauri-plugin-autostart
      if (draft.launchAtStartup) {
        await enable();
      } else {
        await disable();
      }

      triggerBackgroundTimer();
    } finally {
      setSaving(false);
      onClose();
    }
  }

  async function handleCheckForUpdates() {
    setUpdateStatus("checking");
    setLatestVersion(null);
    try {
      const result = await checkForUpdates();
      setUpdateStatus(
        result.status === "no-releases" ? "no-releases" : result.status,
      );
      if (result.status !== "no-releases") setLatestVersion(result.version);
    } catch (error) {
      console.error("[SettingsPane] update check failed:", error);
      setUpdateStatus("error");
    }
  }

  // Check autostart OS state on mount and sync the draft if they disagree
  // (e.g. user manually removed the registry entry)
  useState(() => {
    isEnabled()
      .then((enabled) => {
        if (enabled !== draft.launchAtStartup) {
          setDraft((d) => ({ ...d, launchAtStartup: enabled }));
        }
      })
      .catch(() => {/* ignore — non-critical */});
  });

  function patch<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    // Full overlay
    <div className="absolute inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 shrink-0">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="titlebar-btn text-neutral-400 hover:text-neutral-100"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

        {/* ── Startup ─────────────────────────────────────────────────── */}
        <Section title="Startup">
          <Toggle
            label="Launch at startup"
            description="Start StickUp automatically when you log in"
            checked={draft.launchAtStartup}
            onChange={(v) => patch("launchAtStartup", v)}
          />
          <RadioGroup<StartupVisibility>
            label="Window on launch"
            description="Choose whether StickUp opens visibly or stays in the tray"
            value={draft.startupVisibility}
            onChange={(v) => patch("startupVisibility", v)}
            options={[
              { value: "shown", label: "Show window" },
              { value: "hidden", label: "Start hidden (tray only)" },
            ]}
          />
        </Section>

        {/* ── Notifications ───────────────────────────────────────────── */}
        <Section title="Notifications">
          <RadioGroup<NotificationMode | null>
            label="Default notification mode"
            description="Applied to tasks that don't have their own mode set"
            value={draft.defaultNotificationMode}
            onChange={(v) => patch("defaultNotificationMode", v)}
            options={[
              { value: null, label: "Off" },
              { value: "gentle", label: "Gentle (once)" },
              { value: "nag", label: "Nag (repeat)" },
            ]}
          />
          <NumberField
            label="Reminder lead time"
            description="Minutes before due time to fire the first reminder"
            value={draft.reminderLeadMinutes}
            min={1}
            max={1440}
            onChange={(v) => patch("reminderLeadMinutes", v)}
          />
          <NumberField
            label="Nag interval"
            description="Minutes between repeated nag notifications"
            value={draft.nagIntervalMinutes}
            min={1}
            max={120}
            onChange={(v) => patch("nagIntervalMinutes", v)}
          />
        </Section>

        <Section title="Updates">
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCheckForUpdates}
              disabled={updateStatus === "checking"}
              className="self-start text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 transition-colors"
            >
              {updateStatus === "checking" ? "Checking…" : "Check for updates"}
            </button>
            {updateStatus === "available" && latestVersion && (
              <p className="text-[10px] text-emerald-400">
                Update available ({latestVersion}).{" "}
                <button
                  onClick={() => openUrl(RELEASES_URL)}
                  className="underline hover:text-emerald-300"
                >
                  View releases
                </button>
              </p>
            )}
            {updateStatus === "up-to-date" && (
              <p className="text-[10px] text-neutral-400">You’re up to date.</p>
            )}
            {updateStatus === "no-releases" && (
              <p className="text-[10px] text-neutral-400">
                No releases published yet.
              </p>
            )}
            {updateStatus === "error" && (
              <p className="text-[10px] text-rose-400">
                Couldn’t check for updates. Please try again later.
              </p>
            )}
          </div>
        </Section>

      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex justify-end gap-2 px-4 py-3 border-t border-neutral-800">
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="
            text-xs px-4 py-1.5 rounded font-medium
            bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
            text-white transition-colors
          "
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-neutral-200">{label}</span>
        {description && (
          <span className="text-[10px] text-neutral-500 leading-snug">
            {description}
          </span>
        )}
      </div>
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative shrink-0 w-9 h-5 rounded-full transition-colors cursor-pointer
          ${checked ? "bg-indigo-600" : "bg-neutral-700"}
        `}
      >
        <span
          className={`
            absolute top-0.5 h-4 w-4 rounded-full bg-white shadow
            transition-transform duration-150
            ${checked ? "translate-x-4" : "translate-x-0.5"}
          `}
        />
      </div>
    </label>
  );
}

function RadioGroup<T>({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-200">{label}</span>
      {description && (
        <span className="text-[10px] text-neutral-500 leading-snug -mt-0.5">
          {description}
        </span>
      )}
      <div className="segmented-group mt-0.5">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onChange(opt.value)}
            className={`
              text-[10px] px-2.5 py-1 rounded-full transition-colors
              ${value === opt.value
                ? "bg-indigo-600/50 text-indigo-200 ring-1 ring-indigo-500/60"
                : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-neutral-200">{label}</span>
        {description && (
          <span className="text-[10px] text-neutral-500 leading-snug">
            {description}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
          className="
            w-14 bg-neutral-800 text-neutral-200 text-xs text-center
            rounded px-2 py-1 border border-neutral-700
            focus:border-indigo-500 outline-none
            [appearance:textfield]
            [&::-webkit-inner-spin-button]:appearance-none
          "
        />
        <span className="text-[10px] text-neutral-600">min</span>
      </div>
    </div>
  );
}
