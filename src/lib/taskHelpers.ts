/**
 * taskHelpers.ts
 *
 * Pure helpers for Task construction and display — no side effects.
 */

import type { Task, Priority, Recurrence, NotificationMode } from "../types/task";

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeTask(partial: Partial<Task> & { title: string }): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: partial.title,
    completed: false,
    priority: partial.priority ?? "standard",
    due: partial.due,
    recurrence: partial.recurrence ?? "none",
    notificationMode: partial.notificationMode ?? null,
    notified: false,
    last_notified: null,
    description: partial.description ?? "",
    added: now,
    last_reset: null,
  };
}

// ─── Due-date helpers ─────────────────────────────────────────────────────────

/**
 * Parse a due string that may be date-only ("2026-10-01") or
 * datetime ("2026-10-01T14:30") into a local Date.
 */
export function parseDueDate(iso: string): Date {
  if (iso.includes("T")) {
    // Has time component — parse as local datetime
    return new Date(iso);
  }
  // Date-only — local midnight
  return new Date(iso + "T00:00:00");
}

/**
 * Split a due string into { date, time } for use in form inputs.
 * date = "YYYY-MM-DD", time = "HH:MM" or "".
 */
export function splitDue(due: string): { date: string; time: string } {
  if (due.includes("T")) {
    const [date, time] = due.split("T");
    return { date, time };
  }
  return { date: due, time: "" };
}

/**
 * Join date + time back into a due string.
 * If time is empty, returns date-only string.
 */
export function joinDue(date: string, time: string): string {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

/** Format an ISO date string as a short human label ("Today", "Tomorrow", "Oct 3", "Oct 3 2:30 PM"). */
export function formatDue(iso: string): string {
  const due = parseDueDate(iso);
  const today = startOfLocalDay(new Date());
  const dueDay = startOfLocalDay(due);
  const diff = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  const hasTime = iso.includes("T");
  const timePart = hasTime
    ? " " + due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  if (diff === 0) return "Today" + timePart;
  if (diff === 1) return "Tomorrow" + timePart;
  if (diff === -1) return "Yesterday" + timePart;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + timePart;
}

export function isDueToday(iso: string): boolean {
  const due = startOfLocalDay(parseDueDate(iso));
  const today = startOfLocalDay(new Date());
  return due.getTime() === today.getTime();
}

export function isOverdue(iso: string): boolean {
  const due = parseDueDate(iso);
  const now = new Date();
  if (iso.includes("T")) {
    // Datetime — overdue if the exact datetime has passed
    return due.getTime() < now.getTime();
  }
  // Date-only — overdue if the day has passed
  const today = startOfLocalDay(now);
  return startOfLocalDay(due).getTime() < today.getTime();
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ─── Sort / filter ────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, standard: 1, low: 2 };

export function sortByDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (!a.due && !b.due) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (!a.due) return 1;
    if (!b.due) return -1;
    const diff = a.due.localeCompare(b.due);
    if (diff !== 0) return diff;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export type FilterPriority = Priority | "all";
export type FilterRecurrence = Recurrence | "all";

export function applyFilters(
  tasks: Task[],
  priority: FilterPriority,
  recurrence: FilterRecurrence,
): Task[] {
  return tasks.filter((t) => {
    if (priority !== "all" && t.priority !== priority) return false;
    if (recurrence !== "all" && t.recurrence !== recurrence) return false;
    return true;
  });
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "High",
  standard: "Normal",
  low: "Low",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: "text-red-400",
  standard: "text-sky-400",
  low: "text-emerald-500",
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Once",
  daily: "Daily",
  weekly: "Weekly",
};

export const NOTIFICATION_LABELS: Record<NotificationMode, string> = {
  gentle: "Gentle",
  nag: "Nag",
};
