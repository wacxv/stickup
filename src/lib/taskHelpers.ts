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

/** Format an ISO date string as a short human label ("Today", "Tomorrow", "Oct 3"). */
export function formatDue(iso: string): string {
  const due = new Date(iso + "T00:00:00"); // local midnight
  const today = startOfLocalDay(new Date());
  const diff = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isDueToday(iso: string): boolean {
  const due = new Date(iso + "T00:00:00");
  const today = startOfLocalDay(new Date());
  return due.getTime() === today.getTime();
}

export function isOverdue(iso: string): boolean {
  const due = new Date(iso + "T00:00:00");
  const today = startOfLocalDay(new Date());
  return due.getTime() < today.getTime();
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
  standard: "text-neutral-400",
  low: "text-neutral-600",
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
