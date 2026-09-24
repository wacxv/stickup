export type Priority = "standard" | "high" | "low";
export type Recurrence = "none" | "daily" | "weekly";
export type NotificationMode = "gentle" | "nag";

export interface Task {
  /** Unique identifier (UUID or similar) */
  id: string;
  /** Display title of the task */
  title: string;
  /** Whether the task has been completed */
  completed: boolean;
  /** Visual/sort priority */
  priority: Priority;
  /** Optional ISO-8601 date string, e.g. "2026-10-01" */
  due?: string;
  /** How the task repeats after completion */
  recurrence: Recurrence;
  /** null means no notifications for this task */
  notificationMode: NotificationMode | null;
  /** Whether the initial notification has been fired */
  notified: boolean;
  /** ISO-8601 datetime of the most recent notification, or null */
  last_notified: string | null;
  /** Optional longer-form description / notes */
  description?: string;
  /** ISO-8601 datetime when the task was created */
  added: string;
  /** ISO-8601 datetime when the task was last reset (recurrence) */
  last_reset: string | null;
}
