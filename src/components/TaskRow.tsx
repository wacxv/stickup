/**
 * TaskRow
 *
 * Renders a single task. Behaviours:
 *  - Checkbox toggles completed state
 *  - Click the title to expand the inline edit panel
 *  - Edit panel shows: title, due date + time, priority, recurrence, notification
 *  - Priority badge (coloured dot)
 *  - Due date/time chip: "Today" / "Tomorrow" / date — red when overdue
 *  - Recurrence icon (↻) when task repeats
 *  - In list edit-mode: delete button + up/down reorder arrows
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { Task, Priority, Recurrence, NotificationMode } from "../types/task";
import {
  formatDue,
  isOverdue,
  isDueToday,
  splitDue,
  joinDue,
  todayLocalISO,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  RECURRENCE_LABELS,
  NOTIFICATION_LABELS,
} from "../lib/taskHelpers";
import { PiRepeatBold, PiPencilSimple } from "react-icons/pi";
import { FiChevronDown, FiChevronUp, FiX } from "react-icons/fi";
import { ConfirmDialog } from "./ConfirmDialog";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── Draft state for all editable fields ──────────────────────────────────
  const [draftTitle, setDraftTitle] = useState(task.title);
  const { date: initDate, time: initTime } = splitDue(task.due ?? "");
  const [draftDate, setDraftDate] = useState(initDate);
  const [draftTime, setDraftTime] = useState(initTime);
  const [draftPriority, setDraftPriority] = useState<Priority>(task.priority);
  const [draftRecurrence, setDraftRecurrence] = useState<Recurrence>(task.recurrence);
  const [draftNotification, setDraftNotification] = useState<NotificationMode | null>(
    task.notificationMode,
  );

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync drafts when the task changes externally (e.g. after reorder)
  useEffect(() => {
    if (!editing) {
      setDraftTitle(task.title);
      const { date, time } = splitDue(task.due ?? "");
      setDraftDate(date);
      setDraftTime(time);
      setDraftPriority(task.priority);
      setDraftRecurrence(task.recurrence);
      setDraftNotification(task.notificationMode);
    }
  }, [task, editing]);

  // Automatically close inline editing if global editMode is turned off
  useEffect(() => {
    if (!editMode) {
      setEditing(false);
    }
  }, [editMode]);

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editing) {
      // Small delay to allow the panel to render
      requestAnimationFrame(() => titleInputRef.current?.select());
    }
  }, [editing]);

  function commitEdit() {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      cancelEdit();
      return;
    }
    const dueString = joinDue(draftDate, draftTime);
    const normalizedNewDue = dueString || undefined;
    const dueChanged = task.due !== normalizedNewDue;
    const modeChanged = task.notificationMode !== draftNotification;
    const resetNotification = dueChanged || modeChanged;

    onUpdate({
      ...task,
      title: trimmedTitle,
      due: normalizedNewDue,
      priority: draftPriority,
      recurrence: draftRecurrence,
      notificationMode: draftNotification,
      notified: resetNotification ? false : task.notified,
      last_notified: resetNotification ? null : task.last_notified,
    });
    setEditing(false);
  }

  function cancelEdit() {
    setDraftTitle(task.title);
    const { date, time } = splitDue(task.due ?? "");
    setDraftDate(date);
    setDraftTime(time);
    setDraftPriority(task.priority);
    setDraftRecurrence(task.recurrence);
    setDraftNotification(task.notificationMode);
    setEditing(false);
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { cancelEdit(); }
  }

  function toggleComplete() {
    onUpdate({
      ...task,
      completed: !task.completed,
      notified: task.completed ? task.notified : false,
      last_notified: task.completed ? task.last_notified : null,
    });
  }

  const overdue = !task.completed && task.due && isOverdue(task.due);
  const dueToday = !task.completed && task.due && isDueToday(task.due);

  // Shared input styling
  const fieldClass = `
    bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1
    border border-neutral-700 outline-none
    focus:border-indigo-500
    [color-scheme:dark]
  `;

  return (
    <div
      className={`
        border-b border-neutral-800/60 last:border-b-0
        ${task.completed ? "opacity-50" : ""}
      `}
    >
      {/* ── Main row ───────────────────────────────────────────────────── */}
      <div className="group flex items-center gap-2 px-3 py-1.5 text-xs">
        {/* Reorder arrows (list edit mode only) */}
        {editMode && (
          <div className="flex flex-col shrink-0 -my-1">
            <button
              onClick={() => onMoveUp(task.id)}
              disabled={isFirst}
              aria-label="Move task up"
              className="p-0.5 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-default leading-none"
            ><FiChevronUp aria-hidden="true" /></button>
            <button
              onClick={() => onMoveDown(task.id)}
              disabled={isLast}
              aria-label="Move task down"
              className="p-0.5 text-neutral-600 hover:text-neutral-300 disabled:opacity-20 disabled:cursor-default leading-none"
            ><FiChevronDown aria-hidden="true" /></button>
          </div>
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={task.completed}
          onChange={toggleComplete}
          aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
          className="task-checkbox shrink-0 accent-indigo-500 cursor-pointer w-4 h-4"
        />

        {/* Priority dot */}
        <span
          className={`shrink-0 w-1.5 h-1.5 rounded-full bg-current ${PRIORITY_COLORS[task.priority]}`}
          title={`Priority: ${task.priority}`}
          aria-label={`Priority: ${task.priority}`}
        />

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span
            onClick={() => {
              if (editMode && !editing) setEditing(true);
            }}
            className={`
              block truncate
              ${editMode ? "cursor-pointer hover:text-indigo-300" : "cursor-default"}
              ${task.completed ? "line-through text-neutral-500" : "text-neutral-200"}
            `}
            title={editMode ? `Click to edit "${task.title}"` : task.title}
          >
            {task.title}
          </span>
        </div>

        {/* Recurrence icon */}
        {task.recurrence !== "none" && (
          <span
            title={`Repeats ${task.recurrence}`}
            className="shrink-0 text-neutral-500 text-[10px] select-none"
            aria-label={`Repeats ${task.recurrence}`}
          >
            <PiRepeatBold />
          </span>
        )}

        {/* Due date/time chip */}
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

        {/* Edit & Delete buttons (list edit mode only) */}
        {editMode && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setEditing((prev) => !prev)}
              aria-label={editing ? `Close edit for "${task.title}"` : `Edit "${task.title}"`}
              title={editing ? "Close edit" : "Edit task"}
              className={`
                w-5 h-5 flex items-center justify-center rounded transition-colors
                ${editing
                  ? "text-indigo-400 bg-indigo-950/60 hover:bg-indigo-900/60"
                  : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800"}
              `}
            >
              <PiPencilSimple className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete "${task.title}"`}
              title="Delete task"
              className="
                w-5 h-5 flex items-center justify-center rounded
                text-neutral-500 hover:text-red-400 hover:bg-red-900/30
                transition-colors
              "
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* ── Inline edit panel ────────────────────────────────────────── */}
      {editing && editMode && (
        <div className="px-3 pb-2 pt-1 bg-neutral-900/50 border-t border-neutral-800/40">
          {/* Title */}
          <label className="flex flex-col gap-0.5 mb-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Title</span>
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className={`w-full ${fieldClass}`}
            />
          </label>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {/* Due date */}
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Due date</span>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className={fieldClass}
              />
            </label>

            {/* Due time */}
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Time</span>
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                className={fieldClass}
              />
            </label>

            {/* Priority */}
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Priority</span>
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value as Priority)}
                className={fieldClass}
              >
                {(["standard", "high", "low"] as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </label>

            {/* Recurrence */}
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Repeat</span>
              <select
                value={draftRecurrence}
                onChange={(e) => {
                  const newRecurrence = e.target.value as Recurrence;
                  setDraftRecurrence(newRecurrence);
                  // Auto-default due date to today when enabling recurrence with no date set,
                  // so the recurrence engine always has a date to evaluate.
                  if (newRecurrence !== "none" && !draftDate) {
                    setDraftDate(todayLocalISO());
                  }
                }}
                className={fieldClass}
              >
                {(["none", "daily", "weekly"] as Recurrence[]).map((r) => (
                  <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
                ))}
              </select>
            </label>

            {/* Notification mode */}
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Notify</span>
              <select
                value={draftNotification ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftNotification(v === "" ? null : (v as NotificationMode));
                }}
                className={fieldClass}
              >
                <option value="">Default</option>
                {(["gentle", "nag"] as NotificationMode[]).map((m) => (
                  <option key={m} value={m}>{NOTIFICATION_LABELS[m]}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={cancelEdit}
              className="
                text-[10px] px-2.5 py-1 rounded
                text-neutral-400 hover:text-neutral-200
                bg-neutral-800 hover:bg-neutral-700
                transition-colors
              "
            >
              Cancel
            </button>
            <button
              onClick={commitEdit}
              className="
                text-[10px] px-2.5 py-1 rounded
                bg-indigo-600 hover:bg-indigo-500
                text-white transition-colors
              "
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────── */}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${task.title}"?`}
          message="This task will be permanently removed from the board."
          confirmLabel="Delete task"
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(task.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
