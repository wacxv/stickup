/**
 * boardStore.ts
 *
 * Zustand store for boards and the active board.
 *
 * Responsibilities:
 *  - Hold the in-memory board list and the active board id
 *  - Bootstrap from disk on first load (loadBoards)
 *  - Proxy all mutations through boardIO so changes are always persisted
 *  - Keep index.json in sync after every mutation
 *
 * Consumers should read `boards`, `activeBoardId`, and derived helpers;
 * they should never call boardIO directly — always go through this store.
 */

import { create } from "zustand";
import type { Board } from "../types/board";
import type { Task } from "../types/task";
import {
  createBoard,
  deleteBoard,
  listAllBoards,
  renameBoard,
  saveTasks,
  writeBoard,
} from "../lib/boardIO";
import { loadIndex, syncIndex } from "../lib/indexIO";

// ─── State shape ──────────────────────────────────────────────────────────────

interface BoardState {
  /** Full board list, sorted by order */
  boards: Board[];
  /** ID of the currently visible board, or null before load */
  activeBoardId: string | null;
  /** True while the initial load is in progress */
  loading: boolean;
  /** Non-null when the last operation failed */
  error: string | null;
}

interface BoardActions {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  /** Load all boards from disk.  Call once on app start. */
  loadBoards(): Promise<void>;

  // ── Navigation ─────────────────────────────────────────────────────────────
  setActiveBoard(id: string): void;

  // ── Board CRUD ─────────────────────────────────────────────────────────────
  addBoard(title: string): Promise<Board>;
  renameActiveBoard(newTitle: string): Promise<void>;
  deleteActiveBoard(): Promise<void>;

  // ── Notes ──────────────────────────────────────────────────────────────────
  saveNotes(boardId: string, notes: string): Promise<void>;

  // ── Tasks ──────────────────────────────────────────────────────────────────
  addTask(boardId: string, task: Task): Promise<void>;
  updateTask(boardId: string, task: Task): Promise<void>;
  deleteTask(boardId: string, taskId: string): Promise<void>;
  reorderTasks(boardId: string, tasks: Task[]): Promise<void>;

  // ── Reorder boards ─────────────────────────────────────────────────────────
  reorderBoards(orderedIds: string[]): Promise<void>;
}

export type BoardStore = BoardState & BoardActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useBoardStore = create<BoardStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  boards: [],
  activeBoardId: null,
  loading: false,
  error: null,

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  async loadBoards() {
    set({ loading: true, error: null });
    try {
      const { index, boards: rebuilt } = await loadIndex();

      // loadIndex returns boards only when it had to rebuild; otherwise we
      // need to load them now.
      const boards =
        rebuilt.length > 0 ? rebuilt : await listAllBoards();

      // Determine the initial active board
      const lastOpen = index.lastOpenBoardId;
      const activeBoardId =
        (lastOpen && boards.some((b) => b.id === lastOpen)
          ? lastOpen
          : boards[0]?.id) ?? null;

      set({ boards, activeBoardId, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[boardStore] loadBoards failed:", err);
      set({ loading: false, error: msg });
    }
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  setActiveBoard(id) {
    set({ activeBoardId: id });
    // Persist the choice to index.json (fire-and-forget — not critical)
    const { boards } = get();
    syncIndex(boards, id).catch((err) =>
      console.warn("[boardStore] syncIndex failed:", err),
    );
  },

  // ── Board CRUD ─────────────────────────────────────────────────────────────
  async addBoard(title) {
    const { boards } = get();
    const existingSlugs = boards.map((b) => b.slug);
    const nextOrder = boards.length; // append at end
    const board = await createBoard(title, existingSlugs, nextOrder);
    const next = [...boards, board];
    await syncIndex(next, board.id);
    set({ boards: next, activeBoardId: board.id });
    return board;
  },

  async renameActiveBoard(newTitle) {
    const { boards, activeBoardId } = get();
    const board = boards.find((b) => b.id === activeBoardId);
    if (!board) return;

    const existingSlugs = boards.map((b) => b.slug);
    const renamed = await renameBoard(board, newTitle, existingSlugs);
    const next = boards.map((b) => (b.id === renamed.id ? renamed : b));
    await syncIndex(next, activeBoardId);
    set({ boards: next });
  },

  async deleteActiveBoard() {
    const { boards, activeBoardId } = get();
    const board = boards.find((b) => b.id === activeBoardId);
    if (!board) return;

    await deleteBoard(board.slug);
    const next = boards
      .filter((b) => b.id !== activeBoardId)
      // Recompute order so there are no gaps
      .map((b, i) => ({ ...b, order: i }));

    // Persist reordered files (order field changed)
    await Promise.all(next.map(writeBoard));

    const newActiveId = next[0]?.id ?? null;
    await syncIndex(next, newActiveId);
    set({ boards: next, activeBoardId: newActiveId });
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  async saveNotes(boardId, notes) {
    const { boards } = get();
    const board = boards.find((b) => b.id === boardId);
    if (!board) return;

    const updated = { ...board, notes, updated: new Date().toISOString() };
    await writeBoard(updated);
    set({ boards: boards.map((b) => (b.id === boardId ? updated : b)) });
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  async addTask(boardId, task) {
    await mutateBoard(get, set, boardId, (board) =>
      saveTasks(board, [...board.tasks, task]),
    );
  },

  async updateTask(boardId, task) {
    await mutateBoard(get, set, boardId, (board) =>
      saveTasks(
        board,
        board.tasks.map((t) => (t.id === task.id ? task : t)),
      ),
    );
  },

  async deleteTask(boardId, taskId) {
    await mutateBoard(get, set, boardId, (board) =>
      saveTasks(
        board,
        board.tasks.filter((t) => t.id !== taskId),
      ),
    );
  },

  async reorderTasks(boardId, tasks) {
    await mutateBoard(get, set, boardId, (board) =>
      saveTasks(board, tasks),
    );
  },

  // ── Reorder boards ─────────────────────────────────────────────────────────
  async reorderBoards(orderedIds) {
    const { boards, activeBoardId } = get();
    const reordered = orderedIds
      .map((id, i) => {
        const b = boards.find((b) => b.id === id);
        return b ? { ...b, order: i } : null;
      })
      .filter((b): b is Board => b !== null);

    // Persist order changes to each file
    await Promise.all(reordered.map(writeBoard));
    await syncIndex(reordered, activeBoardId);
    set({ boards: reordered });
  },
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

/** The currently active Board object, or null. */
export function selectActiveBoard(state: BoardStore): Board | null {
  return state.boards.find((b) => b.id === state.activeBoardId) ?? null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Apply a board mutation (returns a new Board from IO) and update state. */
async function mutateBoard(
  get: () => BoardStore,
  set: (partial: Partial<BoardState>) => void,
  boardId: string,
  mutate: (board: Board) => Promise<Board>,
): Promise<void> {
  const { boards } = get();
  const board = boards.find((b) => b.id === boardId);
  if (!board) return;

  try {
    const updated = await mutate(board);
    // Re-read current boards after the async IO to avoid overwriting
    // concurrent mutations (e.g. the background timer and a UI edit racing).
    const currentBoards = get().boards;
    set({ boards: currentBoards.map((b) => (b.id === boardId ? updated : b)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[boardStore] mutation failed:", err);
    set({ error: msg });
  }
}
