import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

interface Props {
  onSettingsOpen: () => void;
}

export function TitleBar({ onSettingsOpen }: Props) {
  const [pinned, setPinned] = useState(false);

  async function handleMinimize() {
    await appWindow.minimize();
  }

  async function handlePin() {
    const next = !pinned;
    await appWindow.setAlwaysOnTop(next);
    setPinned(next);
  }

  async function handleClose() {
    await appWindow.hide();
  }

  return (
    <header
      data-tauri-drag-region
      className="
        flex items-center justify-between
        h-8 px-2 shrink-0 select-none
        bg-neutral-900 text-neutral-300
      "
    >
      {/* App name / drag target */}
      <span
        data-tauri-drag-region
        className="flex-1 text-xs font-semibold tracking-widest uppercase pl-1 cursor-default"
      >
        StickUp
      </span>

      <div className="flex items-center gap-0.5">
        {/* Settings gear */}
        <button
          onClick={onSettingsOpen}
          title="Settings"
          aria-label="Open settings"
          className="titlebar-btn hover:text-neutral-100"
        >
          <GearIcon />
        </button>

        {/* Pin */}
        <button
          onClick={handlePin}
          title={pinned ? "Unpin window" : "Pin window on top"}
          aria-label={pinned ? "Unpin window" : "Pin window on top"}
          aria-pressed={pinned}
          className={`
            titlebar-btn
            ${pinned ? "text-amber-400 hover:text-amber-300" : "hover:text-neutral-100"}
          `}
        >
          <PinIcon pinned={pinned} />
        </button>

        {/* Minimize */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize window"
          className="titlebar-btn hover:text-neutral-100"
        >
          <MinimizeIcon />
        </button>

        {/* Close (hide) */}
        <button
          onClick={handleClose}
          title="Hide window"
          aria-label="Hide window"
          className="titlebar-btn hover:bg-red-600 hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24"
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-2a7 7 0 0 0-7-7 7 7 0 0 0-7 7v2z" />
      <path d="M12 10V3" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
