/**
 * AddTaskRow
 *
 * Sticky input row at the bottom of the tasks pane.
 * Title + Enter is sufficient on its own.
 * A "⋯" button expands optional fields: due date, priority,
 * recurrence, and notification mode.
 */

import { useState, useRef, type KeyboardEvent } from "react";
import type { Priority, Recurrence, NotificationMode } from "../types/task";
import {
  PRIORITY_LABELS,
  RECURRENCE_LABELS,
  NOTIFICATION_LABELS,
} from "../lib/taskHelpers";

interface Props {
  onAdd: (partial: {
    title: string;
    due?: string;
    priority: Priority;
    recurrence: Recurrence;
    notificationMode: NotificationMode | null;
  }) => void;
}

export function AddTaskRow({ onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("standard");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [notificationMode, setNotificationMode] =
    useState<NotificationMode | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({
      title: trimmed,
      due: due || undefined,
      priority,
      recurrence,
      notificationMode,
    });
    // Reset
    setTitle("");
    setDue("");
    setPriority("standard");
    setRecurrence("none");
    setNotificationMode(null);
    setExpanded(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setTitle(""); setExpanded(false); }
  }

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950">
      {/* ── Title row ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="text-neutral-600 text-sm select-none">+</span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add task…"
          className="
            flex-1 bg-transparent text-xs text-neutral-300
            placeholder:text-neutral-600 outline-none
          "
        />
        {/* More options toggle */}
        <button
          onClick={() => setExpanded((x) => !x)}
          title="More options"
          aria-expanded={expanded}
          className={`
            shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors
            ${expanded
              ? "bg-neutral-700 text-neutral-200"
              : "text-neutral-600 hover:text-neutral-400"}
          `}
        >
          ⋯
        </button>
        {/* Submit */}
        <button
          onClick={commit}
          disabled={!title.trim()}
          className="
            shrink-0 text-[10px] px-2 py-1 rounded
            bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30
            disabled:cursor-default text-white transition-colors
          "
        >
          Add
        </button>
      </div>

      {/* ── Expanded options ──────────────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {/* Due date */}
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Due</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="
                bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1
                border border-neutral-700 outline-none
                focus:border-indigo-500
                [color-scheme:dark]
              "
            />
          </label>

          {/* Priority */}
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="
                bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1
                border border-neutral-700 outline-none
                focus:border-indigo-500
              "
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
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="
                bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1
                border border-neutral-700 outline-none
                focus:border-indigo-500
              "
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
              value={notificationMode ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setNotificationMode(v === "" ? null : (v as NotificationMode));
              }}
              className="
                bg-neutral-800 text-neutral-300 text-xs rounded px-2 py-1
                border border-neutral-700 outline-none
                focus:border-indigo-500
              "
            >
              <option value="">Default</option>
              {(["gentle", "nag"] as NotificationMode[]).map((m) => (
                <option key={m} value={m}>{NOTIFICATION_LABELS[m]}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
