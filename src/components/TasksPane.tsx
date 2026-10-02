/**
 * TasksPane
 *
 * Top-level tasks pane for a board.
 * Owns the filter/sort state, delegates rendering to TaskList,
 * and wires all mutations back to the boardStore.
 */

import { useState } from "react";
import type { Board } from "../types/board";
import type { Task } from "../types/task";
import { useBoardStore } from "../stores/boardStore";
import { makeTask } from "../lib/taskHelpers";
import type { FilterPriority, FilterRecurrence } from "../lib/taskHelpers";
import { AddTaskRow } from "./AddTaskRow";
import { TaskFilters } from "./TaskFilters";
import { TaskList } from "./TaskList";
import type { Priority, Recurrence, NotificationMode } from "../types/task";
import { triggerBackgroundTimer } from "../lib/backgroundTimer";

interface Props {
  board: Board;
}

export function TasksPane({ board }: Props) {
  const { addTask, updateTask, deleteTask, reorderTasks } = useBoardStore();

  const [sortByDue, setSortByDue] = useState(false);
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all");
  const [filterRecurrence, setFilterRecurrence] =
    useState<FilterRecurrence>("all");

  // ── Handlers wired to boardStore ─────────────────────────────────────────

  async function handleAdd(partial: {
    title: string;
    due?: string;
    priority: Priority;
    recurrence: Recurrence;
    notificationMode: NotificationMode | null;
  }) {
    const task = makeTask(partial);
    await addTask(board.id, task);
    triggerBackgroundTimer();
  }

  async function handleUpdate(task: Task) {
    await updateTask(board.id, task);
    triggerBackgroundTimer();
  }

  async function handleDelete(id: string) {
    await deleteTask(board.id, id);
  }

  async function handleReorder(tasks: Task[]) {
    await reorderTasks(board.id, tasks);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filters bar */}
      <TaskFilters
        sortByDue={sortByDue}
        onSortByDue={setSortByDue}
        filterPriority={filterPriority}
        onFilterPriority={setFilterPriority}
        filterRecurrence={filterRecurrence}
        onFilterRecurrence={setFilterRecurrence}
      />

      {/* Scrollable task list */}
      <TaskList
        tasks={board.tasks}
        sortEnabled={sortByDue}
        filterPriority={filterPriority}
        filterRecurrence={filterRecurrence}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onReorder={handleReorder}
      />

      {/* Sticky add row */}
      <AddTaskRow onAdd={handleAdd} />
    </div>
  );
}
