import { useState } from "react";
import { useBoardStore, selectActiveBoard } from "../stores/boardStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { LastOpenPane } from "../types/settings";
import { NotesPane } from "./NotesPane";
import { TasksPane } from "./TasksPane";

type Pane = LastOpenPane;

/**
 * BoardShell
 *
 * Layout behaviour:
 *  - Narrow (< 400 px): single-pane with a "Notes / Tasks" segmented toggle
 *  - Wide   (≥ 400 px): side-by-side 50/50 split, both panes always visible
 */
export function BoardShell() {
  const board = useBoardStore(selectActiveBoard);
  const { settings, updateSettings } = useSettingsStore();
  const [activePane, setActivePane] = useState<Pane>(settings.lastOpenPane);

  function handlePaneChange(pane: Pane) {
    setActivePane(pane);
    void updateSettings({ lastOpenPane: pane });
  }

  if (!board) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Narrow segmented toggle — hidden on wide ──────────────────── */}
      <div className="@[400px]/app:hidden flex shrink-0 border-b border-neutral-800">
        <PaneToggle active={activePane} onChange={handlePaneChange} />
      </div>

      {/* ── Pane area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* Notes pane */}
        <div
          className={`
            flex flex-col min-h-0 min-w-0
            @[400px]/app:flex @[400px]/app:flex-1
            @[400px]/app:border-r @[400px]/app:border-neutral-800
            ${activePane === "notes" ? "flex flex-1" : "hidden"}
          `}
        >
          <NotesPane key={board.id} board={board} />
        </div>

        {/* Tasks pane */}
        <div
          className={`
            flex flex-col min-h-0 min-w-0
            @[400px]/app:flex @[400px]/app:flex-1
            ${activePane === "tasks" ? "flex flex-1" : "hidden"}
          `}
        >
          <TasksPane key={board.id} board={board} />
        </div>

      </div>
    </div>
  );
}

// ─── Segmented toggle ─────────────────────────────────────────────────────────

function PaneToggle({
  active,
  onChange,
}: {
  active: Pane;
  onChange: (p: Pane) => void;
}) {
  return (
    <div className="flex w-full">
      {(["notes", "tasks"] as Pane[]).map((pane) => (
        <button
          key={pane}
          onClick={() => onChange(pane)}
          className={`
            flex-1 py-1.5 text-xs font-medium capitalize transition-colors
            ${
              active === pane
                ? "text-neutral-100 border-b-2 border-indigo-500"
                : "text-neutral-500 hover:text-neutral-300"
            }
          `}
        >
          {pane}
        </button>
      ))}
    </div>
  );
}
