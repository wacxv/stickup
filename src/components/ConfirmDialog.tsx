/**
 * ConfirmDialog
 *
 * A lightweight modal confirmation dialog. Renders as a centred card over a
 * semi-transparent backdrop.  Pressing Escape or clicking the backdrop cancels.
 *
 * Props:
 *   title       — Bold heading shown at the top
 *   message     — One-liner body text (plain string)
 *   confirmLabel — Text for the destructive confirm button (default "Delete")
 *   onConfirm   — Called when the user confirms
 *   onCancel    — Called when the user cancels / presses Escape
 */

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button so keyboard users can act immediately
  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    // Backdrop
    <div
      className="
        fixed inset-0 z-[200] flex items-center justify-center
        bg-black/60
      "
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Card */}
      <div className="
        bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl
        w-[260px] p-4 flex flex-col gap-3
      ">
        {/* Header */}
        <p className="text-sm font-semibold text-neutral-100 leading-tight">
          {title}
        </p>

        {/* Body */}
        <p className="text-xs text-neutral-400 leading-relaxed">
          {message}
          <span className="block mt-1 text-neutral-500">
            This can&apos;t be undone.
          </span>
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onCancel}
            className="
              text-xs px-3 py-1.5 rounded
              bg-neutral-800 hover:bg-neutral-700
              text-neutral-300 hover:text-neutral-100
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className="
              text-xs px-3 py-1.5 rounded
              bg-red-700 hover:bg-red-600
              text-white transition-colors
            "
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
