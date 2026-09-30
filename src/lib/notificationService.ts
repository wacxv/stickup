/**
 * notificationService.ts
 *
 * Decides whether to fire a notification for a task and sends it via
 * tauri-plugin-notification.
 *
 * Rules (from spec):
 *  - Resolve effective mode: task.notificationMode ?? settings.defaultNotificationMode
 *  - null effective mode → no notification ever
 *  - Only notify when task has a due date and is within reminderLeadMinutes of it
 *  - "gentle": fire once (notified=false), then stay silent
 *  - "nag":    fire on first trigger, then repeat every nagIntervalMinutes
 *              until the task is completed OR overdue (due date has passed)
 *  - Reset notified/last_notified whenever a task is completed or recurrence resets
 *    (handled in recurrenceService — we only read those fields here)
 */

import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Task, NotificationMode } from "../types/task";
import type { Settings } from "../types/settings";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface NotificationUpdate {
  taskId: string;
  notified: boolean;
  last_notified: string; // ISO datetime
}

/**
 * Check every task in `tasks` and return an array of updates for tasks
 * that should be marked as notified/last_notified.
 * Fires the actual OS notification as a side-effect.
 *
 * Designed to be called from the background timer every 60 s.
 */
export async function checkNotifications(
  tasks: Task[],
  settings: Settings,
): Promise<NotificationUpdate[]> {
  const now = new Date();
  const updates: NotificationUpdate[] = [];

  for (const task of tasks) {
    if (task.completed) continue;
    if (!task.due) continue;

    const effectiveMode = resolveMode(task, settings);
    if (!effectiveMode) continue;

    // Due datetime — if the due string has a time part, use it directly;
    // otherwise fall back to midnight.
    const dueDate = task.due!.includes("T")
      ? new Date(task.due!)
      : new Date(task.due! + "T00:00:00");
    const triggerTime = new Date(
      dueDate.getTime() - settings.reminderLeadMinutes * 60 * 1000,
    );

    // Not yet in notification window
    if (now < triggerTime) continue;

    // Overdue — past the due datetime — stop nagging (spec: nag stops when overdue)
    if (now > dueDate) continue;

    if (effectiveMode === "gentle") {
      if (task.notified) continue; // already fired once
      await fire(task);
      updates.push({
        taskId: task.id,
        notified: true,
        last_notified: now.toISOString(),
      });
    } else {
      // "nag" mode
      if (task.last_notified) {
        const lastFired = new Date(task.last_notified);
        const msSinceLast = now.getTime() - lastFired.getTime();
        const intervalMs = settings.nagIntervalMinutes * 60 * 1000;
        if (msSinceLast < intervalMs) continue; // not time yet
      }
      await fire(task);
      updates.push({
        taskId: task.id,
        notified: true,
        last_notified: now.toISOString(),
      });
    }
  }

  return updates;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveMode(task: Task, settings: Settings): NotificationMode | null {
  return task.notificationMode ?? settings.defaultNotificationMode;
}

async function fire(task: Task): Promise<void> {
  try {
    await sendNotification({
      title: "StickUp",
      body: task.due
        ? `📌 ${task.title} — due ${formatDueLabel(task.due)}`
        : `📌 ${task.title}`,
    });
  } catch (err) {
    // Non-critical — swallow so a notification failure never crashes the timer
    console.warn("[notificationService] sendNotification failed:", err);
  }
}

function formatDueLabel(iso: string): string {
  const hasTime = iso.includes("T");
  const d = hasTime ? new Date(iso) : new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const timePart = hasTime
    ? " at " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  if (diff === 0) return "today" + timePart;
  if (diff === 1) return "tomorrow" + timePart;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + timePart;
}
