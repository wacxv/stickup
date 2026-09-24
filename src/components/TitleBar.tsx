import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Grab the current window handle once — safe to call at module level in Tauri v2
const appWindow = getCurrentWindow();

export function TitleBar() {
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
    // Never destroy — hide so the tray can restore the window later
    await appWindow.hide();
  }

  return (
    <header
      // data-tauri-drag-region lets the user drag the window by the title bar
      data-tauri-drag-region
      className="
        flex items-center justify-between
        h-8 px-2 shrink-0 select-none
        bg-neutral-900 text-neutral-300
      "
    >
      {/* App name / drag target — takes up remaining space */}
      <span
        data-tauri-drag-region
        className="flex-1 text-xs font-semibold tracking-widest uppercase pl-1 cursor-default"
      >
        StickUp
      </span>

      {/* Window controls — click targets must NOT inherit drag-region */}
      <div className="flex items-center gap-0.5">
        {/* Pin / always-on-top */}
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

        {/* Close (hides, never quits) */}
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

// ─── Inline SVG icons (no external dep) ──────────────────────────────────────

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Simple thumbtack shape */}
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-2a7 7 0 0 0-7-7 7 7 0 0 0-7 7v2z" />
      <path d="M12 10V3" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
