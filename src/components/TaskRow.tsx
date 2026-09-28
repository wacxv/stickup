/**
 * TaskRow
 *
 * Renders a single task. Behaviours:
 *  - Checkbox toggles completed state
 *  - Click the title to inline-edit (blur or Enter commits, Escape cancels)
 *  - Priority badge (coloured dot)
 *  - Due date chip: "Today" / "Tomorrow" / date — red when overdue
 *  - Recurrence icon (↻) when task repeats
 *  - In edit-mode: delete button + up/down reorder arrows
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { Task } from "../types/task";
import {
  formatDue,
  isOverdue,
  isDueToday,
  PRIORITY_COLORS,
} from "../lib/taskHelpers";
import { PiRepeatBold } from "react-icons/pi";

interface Props {
  task: Task;
  editMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export function TaskRow({
  task,
  editMode,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when the task changes externally (e.g. after reorder)
  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [task.title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ ...task, title: trimmed });
    } else {
      setDraft(task.title); // revert if empty or unchanged
    }
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { setDraft(task.title); setEditing(false); }
  }

  function toggleComplete() {
    onUpdate({
      ...task,
      completed: !task.completed,
      // Reset notification state when completing
      notified: task.completed ? task.notified : false,
      last_notified: task.completed ? task.last_notified : null,
    });
  }

  const overdue = !task.completed && task.due && isOverdue(task.due);
  const dueToday = !task.completed && task.due && isDueToday(task.due);

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 text-xs
        border-b border-neutral-800/60 last:border-b-0
        ${task.completed ? "opacity-50" : ""}
      `}
    >
      {/* ── Reorder arrows (edit mode only) ─────────────────────────── */}
      {editMode && (
        <div className="flex flex-col shrink-0 -my-1">
          <button
            onClick={() => onMoveUp(task.id)}
            disabled={isFirst}
            aria-label="Move task up"
            className="p-0.5 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-default leading-none"
          >▴</button>
          <button
            onClick={() => onMoveDown(task.id)}
            disabled={isLast}
            aria-label="Move task down"
            className="p-0.5 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-default leading-none"
          >▾</button>
        </div>
      )}

      {/* ── Checkbox ─────────────────────────────────────────────────── */}
      <input
        type="checkbox"
        checked={task.completed}
        onChange={toggleComplete}
        aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
        className="shrink-0 accent-indigo-500 cursor-pointer w-3.5 h-3.5"
      />

      {/* ── Priority dot ─────────────────────────────────────────────── */}
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full bg-current ${PRIORITY_COLORS[task.priority]}`}
        title={`Priority: ${task.priority}`}
        aria-label={`Priority: ${task.priority}`}
      />

      {/* ── Title ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="
              w-full bg-neutral-800 text-neutral-100 text-xs
              border border-indigo-500 rounded px-1 py-0.5 outline-none
            "
          />
        ) : (
          <span
            onClick={() => !editMode && setEditing(true)}
            className={`
              block truncate cursor-text
              ${task.completed ? "line-through text-neutral-500" : "text-neutral-200"}
            `}
            title={task.title}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* ── Recurrence icon ──────────────────────────────────────────── */}
      {task.recurrence !== "none" && (
        <span
          title={`Repeats ${task.recurrence}`}
          className="shrink-0 text-neutral-500 text-[10px] select-none"
          aria-label={`Repeats ${task.recurrence}`}
        >
          <PiRepeatBold />
        </span>
      )}

      {/* ── Due date chip ─────────────────────────────────────────────── */}
      {task.due && (
        <span
          className={`
            shrink-0 text-[10px] px-1.5 py-0.5 rounded-full
            ${overdue
              ? "bg-red-900/50 text-red-400"
              : dueToday
              ? "bg-amber-900/40 text-amber-400"
              : "bg-neutral-800 text-neutral-500"}
          `}
        >
          {formatDue(task.due)}
        </span>
      )}

      {/* ── Delete button (edit mode only) ───────────────────────────── */}
      {editMode && (
        <button
          onClick={() => onDelete(task.id)}
          aria-label={`Delete "${task.title}"`}
          className="
            shrink-0 w-5 h-5 flex items-center justify-center rounded
            text-neutral-600 hover:text-red-400 hover:bg-red-900/30
            transition-colors
          "
        >
          ✕
        </button>
      )}
    </div>
  );
}
