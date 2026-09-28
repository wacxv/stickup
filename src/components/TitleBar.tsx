import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MdClose, MdOutlinePushPin, MdPushPin, MdMinimize } from "react-icons/md";
import { GoGear } from "react-icons/go";

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
          <GoGear />
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
          {pinned ? <MdPushPin /> : <MdOutlinePushPin />}
        </button>

        {/* Minimize */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize window"
          className="titlebar-btn hover:text-neutral-100"
        >
          <MdMinimize />
        </button>

        {/* Close (hide) */}
        <button
          onClick={handleClose}
          title="Hide window"
          aria-label="Hide window"
          className="titlebar-btn hover:bg-red-600 hover:text-white"
        >
          <MdClose />
        </button>
      </div>
    </header>
  );
}