/**
 * NotesPane
 *
 * Orchestrates edit ↔ preview mode for a board's notes.
 *
 * - Starts in preview mode
 * - "Preview" button switches to rendered HTML view
 * - Auto-saves to the board store 800 ms after the last keystroke
 * - Shows a "start typing" empty-state hint when notes are blank AND in preview
 */

import { useState, useCallback, useEffect } from "react";
import { NotesEditor } from "./NotesEditor";
import { NotesPreview } from "./NotesPreview";
import { useBoardStore } from "../stores/boardStore";
import { useDebounce } from "../lib/useDebounce";
import type { Board } from "../types/board";
import { FiFileText } from "react-icons/fi";

const TASK_MARKER_RE = /^(\s*(?:[-+*]|\d+[.)])\s+)\[([ xX])\](\s+)/gm;

interface Props {
  board: Board;
}

export function NotesPane({ board }: Props) {
  const { saveNotes } = useBoardStore();
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [localNotes, setLocalNotes] = useState(board.notes);

  // Reset local notes when the board changes (safety net)
  useEffect(() => {
    setLocalNotes(board.notes);
  }, [board.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush to store/disk 800 ms after the last change
  const persistNotes = useCallback(
    (notes: string) => {
      saveNotes(board.id, notes);
    },
    [board.id, saveNotes],
  );
  const debouncedPersist = useDebounce(persistNotes, 300);

  function handleChange(value: string) {
    setLocalNotes(value);
    debouncedPersist(value);
  }

  function handleToggleTask(taskIndex: number) {
    let currentTaskIndex = 0;
    const updatedNotes = localNotes.replace(
      TASK_MARKER_RE,
      (match, prefix: string, marker: string, suffix: string) => {
        if (currentTaskIndex++ !== taskIndex) {
          return match;
        }

        return `${prefix}[${marker === " " ? "x" : " "}]${suffix}`;
      },
    );

    if (updatedNotes !== localNotes) {
      handleChange(updatedNotes);
    }
  }

  const isEmpty = localNotes.trim().length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Mode toggle bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 shrink-0 border-b border-neutral-800">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Notes
        </span>
        <div className="flex">
          {(["edit", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`
                px-2 py-0.5 text-[10px] capitalize rounded transition-colors
                ${mode === m
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"}
              `}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pane content ─────────────────────────────────────────────────── */}
      {mode === "edit" ? (
        <NotesEditor
          value={localNotes}
          onChange={handleChange}
          placeholder={`Notes for "${board.title}"…\n\nTry **bold**, _italic_, - lists, or \`\`\`code blocks\`\`\``}
        />
      ) : isEmpty ? (
        <EmptyNotesState onEdit={() => setMode("edit")} />
      ) : (
        <NotesPreview source={localNotes} onToggleTask={handleToggleTask} />
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyNotesState({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center select-none">
      <FiFileText className="text-2xl opacity-40" aria-hidden="true" />
      <p className="text-xs text-neutral-500">No notes yet.</p>
      <button
        onClick={onEdit}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
      >
        Start writing
      </button>
    </div>
  );
}
