/**
 * recurrenceService.ts
 *
 * Handles recurring task resets.
 *
 * Rules (from spec):
 *  - A recurring task (daily/weekly) resets when its due date has passed AND
 *    it has not already been reset today (local calendar midnight boundary).
 *  - "Reset" means:
 *      completed  → false
 *      notified   → false
 *      last_notified → null
 *      last_reset → now (ISO)
 *      due        → advanced by 1 day (daily) or 7 days (weekly)
 *  - Tasks with recurrence="none" are never touched here.
 *  - Completed non-recurring tasks are also not touched.
 */

import type { Task } from "../types/task";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Given the current task list, return only the tasks that need resetting,
 * already mutated with their new values.
 *
 * Designed to be called from the background timer every 60 s.
 */
export function getRecurrenceResets(tasks: Task[]): Task[] {
  const today = startOfLocalDay(new Date());
  const resets: Task[] = [];

  for (const task of tasks) {
    if (task.recurrence === "none") continue;
    if (!task.due) continue;

    const dueDate = startOfLocalDay(new Date(task.due + "T00:00:00"));

    // Not yet past due — nothing to reset
    if (dueDate >= today) continue;

    // Already reset today — skip
    if (task.last_reset) {
      const lastReset = startOfLocalDay(new Date(task.last_reset));
      if (lastReset >= today) continue;
    }

    resets.push(advanceDue(task, today));
  }

  return resets;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function advanceDue(task: Task, today: Date): Task {
  const now = new Date().toISOString();
  const daysToAdd = task.recurrence === "daily" ? 1 : 7;

  // Advance from the existing due date (not today) so we don't drift
  const base = startOfLocalDay(new Date(task.due! + "T00:00:00"));
  let next = new Date(base);

  // Keep advancing until the next due date is today or in the future
  while (next < today) {
    next = new Date(next.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  }

  const nextDue = toISODateString(next);

  return {
    ...task,
    completed: false,
    notified: false,
    last_notified: null,
    last_reset: now,
    due: nextDue,
  };
}

/** Returns a Date at local midnight for the given date. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Format a Date as "YYYY-MM-DD" in local time. */
function toISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
