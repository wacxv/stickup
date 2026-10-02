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

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Task, NotificationMode } from "../types/task";
import type { Settings } from "../types/settings";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface NotificationUpdate {
  taskId: string;
  notified: boolean;
  last_notified: string; // ISO datetime
}

/**
 * Ensures notification permission has been requested and granted.
 * Returns true if granted, false otherwise.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    console.info("[notificationService] permission status:", granted);
    if (!granted) {
      console.info("[notificationService] requesting notification permission");
      const permission = await requestPermission();
      granted = permission === "granted";
      console.info("[notificationService] permission request result:", permission);
    }
    return granted;
  } catch (err) {
    console.warn("[notificationService] Permission check/request failed:", err);
    return false;
  }
}

/**
 * Check every task in `tasks` and return an array of updates for tasks
 * that should be marked as notified/last_notified.
 * Fires the actual OS notification as a side-effect.
 *
 * Designed to be called from the background timer every 60 s or on demand.
 */
export async function checkNotifications(
  tasks: Task[],
  settings: Settings,
): Promise<NotificationUpdate[]> {
  const now = new Date();
  const updates: NotificationUpdate[] = [];

  console.info("[notificationService] check started", {
    now: now.toISOString(),
    taskCount: tasks.length,
    settings,
  });

  for (const task of tasks) {
    if (task.completed) {
      console.info("[notificationService] skip completed task", task.title);
      continue;
    }
    if (!task.due) {
      console.info("[notificationService] skip task without due date", task.title);
      continue;
    }

    const effectiveMode = resolveMode(task, settings);
    console.info("[notificationService] evaluating task", {
      id: task.id,
      title: task.title,
      due: task.due,
      effectiveMode,
      notified: task.notified,
      last_notified: task.last_notified,
    });
    if (!effectiveMode) {
      console.info("[notificationService] skip notifications disabled", task.title);
      continue;
    }

    const hasTime = task.due.includes("T");

    if (hasTime) {
      const dueDate = new Date(task.due);
      const triggerTime = new Date(
        dueDate.getTime() - settings.reminderLeadMinutes * 60 * 1000,
      );

      console.info("[notificationService] datetime window", {
        title: task.title,
        dueDate: dueDate.toString(),
        triggerTime: triggerTime.toString(),
        now: now.toString(),
      });

      // Not yet in notification window
      if (now < triggerTime) {
        console.info("[notificationService] skip before reminder window", task.title);
        continue;
      }

      if (effectiveMode === "gentle") {
        if (task.notified) {
          console.info("[notificationService] skip gentle task already notified", task.title);
          continue;
        }
        // Don't fire if ancient (e.g. more than 24 hours overdue without ever notifying)
        const msPastDue = now.getTime() - dueDate.getTime();
        if (msPastDue > 24 * 60 * 60 * 1000) {
          console.info("[notificationService] skip gentle task older than 24 hours", task.title);
          continue;
        }
      } else {
        // "nag" mode: stop repeating once overdue, unless it hasn't fired at all yet
        if (now > dueDate && task.notified) {
          console.info("[notificationService] skip overdue nag task already notified", task.title);
          continue;
        }

        if (task.last_notified) {
          const lastFired = new Date(task.last_notified);
          const msSinceLast = now.getTime() - lastFired.getTime();
          const intervalMs = settings.nagIntervalMinutes * 60 * 1000;
          if (msSinceLast < intervalMs) {
            console.info("[notificationService] skip nag task before repeat interval", task.title);
            continue;
          }
        }
      }
    } else {
      // Date-only due date: due today or overdue
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const dueParts = task.due.split("-").map(Number);
      const dueDay = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);

      // If due on a future day, not yet time
      if (dueDay.getTime() > startOfToday.getTime()) {
        console.info("[notificationService] skip date-only task due on a future day", task.title);
        continue;
      }

      if (effectiveMode === "gentle") {
        if (task.notified) {
          console.info("[notificationService] skip gentle task already notified", task.title);
          continue;
        }
        const daysPast = Math.round(
          (startOfToday.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysPast > 1) {
          console.info("[notificationService] skip date-only task older than one day", task.title);
          continue;
        }
      } else {
        const isPastDueDay = startOfToday.getTime() > dueDay.getTime();
        if (isPastDueDay && task.notified) {
          console.info("[notificationService] skip overdue nag task already notified", task.title);
          continue;
        }

        if (task.last_notified) {
          const lastFired = new Date(task.last_notified);
          const msSinceLast = now.getTime() - lastFired.getTime();
          const intervalMs = settings.nagIntervalMinutes * 60 * 1000;
          if (msSinceLast < intervalMs) {
            console.info("[notificationService] skip nag task before repeat interval", task.title);
            continue;
          }
        }
      }
    }

    const sent = await fire(task);
    console.info("[notificationService] notification attempt", {
      title: task.title,
      sent,
    });
    if (sent) {
      updates.push({
        taskId: task.id,
        notified: true,
        last_notified: now.toISOString(),
      });
    }
  }

  console.info("[notificationService] check finished", {
    notificationsSent: updates.length,
  });
  return updates;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveMode(task: Task, settings: Settings): NotificationMode | null {
  return task.notificationMode ?? settings.defaultNotificationMode;
}

async function fire(task: Task): Promise<boolean> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      console.warn(
        "[notificationService] Notification permission not granted, skipping notification",
      );
      return false;
    }

    sendNotification({
      title: "StickUp",
      body: task.due
        ? `📌 ${task.title} — due ${formatDueLabel(task.due)}`
        : `📌 ${task.title}`,
    });
    return true;
  } catch (err) {
    // Non-critical — swallow so a notification failure never crashes the timer
    console.warn("[notificationService] sendNotification failed:", err);
    return false;
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
