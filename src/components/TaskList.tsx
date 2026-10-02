/**
 * TaskList
 *
 * Renders the filtered/sorted task rows, the completed counter,
 * and the edit-mode toggle.
 *
 * Reordering is done via up/down arrow buttons in edit mode (no drag-and-drop
 * dependency needed for the v1 scope).
 */

import { useState } from "react";
import type { Task } from "../types/task";
import { TaskRow } from "./TaskRow";
import type { FilterPriority, FilterRecurrence } from "../lib/taskHelpers";
import { sortByDue, applyFilters } from "../lib/taskHelpers";

interface Props {
  tasks: Task[];
  sortEnabled: boolean;
  filterPriority: FilterPriority;
  filterRecurrence: FilterRecurrence;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onReorder: (tasks: Task[]) => void;
}

export function TaskList({
  tasks,
  sortEnabled,
  filterPriority,
  filterRecurrence,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const [editMode, setEditMode] = useState(false);

  // Apply filters then optionally sort
  const filtered = applyFilters(tasks, filterPriority, filterRecurrence);
  const visible = sortEnabled ? sortByDue(filtered) : filtered;

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  // Reorder helpers — operate on the *full* task array to preserve
  // tasks that are currently hidden by filters
  function moveUp(id: string) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const next = [...tasks];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onReorder(next);
  }

  function moveDown(id: string) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= tasks.length - 1) return;
    const next = [...tasks];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onReorder(next);
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 shrink-0 border-b border-neutral-800">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Tasks
        </span>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="text-[10px] text-neutral-600">
              {completedCount}/{totalCount} done
            </span>
          )}
          <button
            onClick={() => setEditMode((m) => !m)}
            className={`
              text-[10px] px-2 py-0.5 rounded transition-colors
              ${editMode
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"}
            `}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* ── Task rows ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {visible.length === 0 ? (
          <EmptyState
            hasAny={totalCount > 0}
            isFiltered={filtered.length !== tasks.length}
          />
        ) : (
          visible.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              editMode={editMode}
              isFirst={i === 0}
              isLast={i === visible.length - 1}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyState({
  hasAny,
  isFiltered,
}: {
  hasAny: boolean;
  isFiltered: boolean;
}) {
  if (isFiltered) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 p-6 text-center select-none">
        <span className="text-xl opacity-30">🔍</span>
        <p className="text-xs text-neutral-500">No tasks match the current filters.</p>
      </div>
    );
  }
  if (!hasAny) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center select-none">
        <span className="text-2xl opacity-30">✅</span>
        <p className="text-xs text-neutral-500">No tasks yet.</p>
        <p className="text-[10px] text-neutral-600">Use the input below to add one.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-1 p-6 text-center select-none">
      <span className="text-xl opacity-40">🎉</span>
      <p className="text-xs text-neutral-500">All tasks complete!</p>
    </div>
  );
}
