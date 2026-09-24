import type { Task } from "./task";

export interface Board {
  /** Unique identifier (UUID or similar) */
  id: string;
  /** Display title for this board / list */
  title: string;
  /** 0-based sort order among all boards */
  order: number;
  /** ISO-8601 datetime when the board was created */
  created: string;
  /** ISO-8601 datetime of the last modification */
  updated: string;
  /** Ordered list of tasks belonging to this board */
  tasks: Task[];
}
