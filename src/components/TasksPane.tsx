/**
 * TasksPane
 *
 * Top-level tasks pane for a board.
 * Owns the filter/sort state, delegates rendering to TaskList,
 * and wires all mutations back to the boardStore.
 */

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
  filterState: {
    sortByDue: boolean;
    filterPriority: FilterPriority;
    filterRecurrence: FilterRecurrence;
  };
  onFilterStateChange: (
    update: Partial<Props["filterState"]>,
  ) => void;
}

export function TasksPane({
  board,
  filterState,
  onFilterStateChange,
}: Props) {
  const { addTask, updateTask, deleteTask, reorderTasks } = useBoardStore();

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
        sortByDue={filterState.sortByDue}
        onSortByDue={(sortByDue) => onFilterStateChange({ sortByDue })}
        filterPriority={filterState.filterPriority}
        onFilterPriority={(filterPriority) =>
          onFilterStateChange({ filterPriority })
        }
        filterRecurrence={filterState.filterRecurrence}
        onFilterRecurrence={(filterRecurrence) =>
          onFilterStateChange({ filterRecurrence })
        }
      />

      {/* Scrollable task list */}
      <TaskList
        tasks={board.tasks}
        sortEnabled={filterState.sortByDue}
        filterPriority={filterState.filterPriority}
        filterRecurrence={filterState.filterRecurrence}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onReorder={handleReorder}
      />

      {/* Sticky add row */}
      <AddTaskRow onAdd={handleAdd} />
    </div>
  );
}
