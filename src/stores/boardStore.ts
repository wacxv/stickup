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
 * Ghost boards:
 *  - A "ghost" board exists only in memory (board.ghost === true).
 *  - It is never written to disk until it acquires real content.
 *  - Calling closeBoard() on a ghost silently discards it.
 *  - Any mutating action on a ghost (rename, notes, task add) first calls
 *    materialiseBoard() to write the file, then proceeds normally.
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
  makeGhostBoard,
  materialiseBoard,
  renameBoard,
  saveTasks,
  writeBoard,
} from "../lib/boardIO";
import { loadIndex, syncIndex } from "../lib/indexIO";

// ─── State shape ──────────────────────────────────────────────────────────────

interface BoardState {
  /** Full board list, sorted by order */
  boards: Board[];
  /** Saved boards closed from the tab strip, newest first. */
  recentlyClosed: Board[];
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
  /** Create a board and immediately write it to disk. */
  addBoard(title: string): Promise<Board>;
  /**
   * Create a ghost board in memory only. Nothing is written to disk until
   * the board receives real content (rename / notes / task).
   */
  addGhostBoard(title: string): Board;
  renameActiveBoard(newTitle: string): Promise<void>;
  /** Permanently delete a board by ID (with disk removal). */
  deleteBoardById(id: string): Promise<void>;
  /** @deprecated use deleteBoardById — kept for callers that relied on this */
  deleteActiveBoard(): Promise<void>;
  /**
   * Remove a board from the UI session without deleting the disk file.
   * If the board is a ghost it is simply discarded (no disk operation).
   */
  closeBoard(id: string): Promise<void>;
  reopenBoard(id: string): Promise<void>;

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
  recentlyClosed: [],
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
      const allBoards =
        rebuilt.length > 0 ? rebuilt : await listAllBoards();
      const closedIds = new Set(index.closedBoardIds ?? []);
      const boards = allBoards.filter((board) => !closedIds.has(board.id));
      const recentlyClosed = (index.closedBoardIds ?? [])
        .map((id) => allBoards.find((board) => board.id === id))
        .filter((board): board is Board => board !== undefined);

      // Determine the initial active board
      const lastOpen = index.lastOpenBoardId;
      const activeBoardId =
        (lastOpen && boards.some((b) => b.id === lastOpen)
          ? lastOpen
          : boards[0]?.id) ?? null;

      set({ boards, recentlyClosed, activeBoardId, loading: false });
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
    const selected = boards.find((board) => board.id === id);
    // Selecting an in-memory ghost must not create an index entry on disk.
    if (selected?.ghost) return;
    // Only sync persisted (non-ghost) boards
    const persisted = boards.filter((b) => !b.ghost);
    syncIndex(
      persisted,
      id,
      get().recentlyClosed.map((board) => board.id),
      get().recentlyClosed,
    ).catch((err) =>
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
    await syncIndex(
      next.filter((b) => !b.ghost),
      board.id,
      get().recentlyClosed.map((b) => b.id),
      get().recentlyClosed,
    );
    set({ boards: next, activeBoardId: board.id });
    return board;
  },

  addGhostBoard(title) {
    const { boards } = get();
    const existingSlugs = boards.map((b) => b.slug);
    const nextOrder = boards.length;
    const board = makeGhostBoard(title, existingSlugs, nextOrder);
    // Add to store — NOT to index, NOT to disk
    set({ boards: [...boards, board], activeBoardId: board.id });
    return board;
  },

  async renameActiveBoard(newTitle) {
    const { boards, activeBoardId } = get();
    const board = boards.find((b) => b.id === activeBoardId);
    if (!board) return;

    // Materialise ghost boards on first rename away from the placeholder
    let source = board;
    if (board.ghost) {
      // Temporarily assign the new title so the slug reflects the real name
      source = { ...board, title: newTitle };
      source = await materialiseBoard(source);
    }

    const renamed = await renameBoard(source, newTitle);
    const next = boards.map((b) => (b.id === renamed.id ? renamed : b));
    await syncIndex(
      next.filter((b) => !b.ghost),
      activeBoardId,
      get().recentlyClosed.map((b) => b.id),
      get().recentlyClosed,
    );
    set({ boards: next });
  },

  async deleteBoardById(id) {
    const { boards, activeBoardId, recentlyClosed } = get();
    const board = boards.find((b) => b.id === id);
    if (!board) return;

    // Ghost boards have no file to delete
    if (!board.ghost) {
      await deleteBoard(board.slug);
    }

    const next = boards
      .filter((b) => b.id !== id)
      .map((b, i) => ({ ...b, order: i }));

    // Persist reordered files (order field changed) — skip ghosts
    await Promise.all(next.filter((b) => !b.ghost).map(writeBoard));

    const newActiveId =
      activeBoardId === id ? (next[0]?.id ?? null) : activeBoardId;
    await syncIndex(
      next.filter((b) => !b.ghost),
      newActiveId,
      recentlyClosed
        .filter((b) => b.id !== id)
        .map((b) => b.id),
      recentlyClosed.filter((b) => b.id !== id),
    );
    set({
      boards: next,
      activeBoardId: newActiveId,
      recentlyClosed: recentlyClosed.filter((b) => b.id !== id),
    });
  },

  async deleteActiveBoard() {
    const { activeBoardId } = get();
    if (activeBoardId) await get().deleteBoardById(activeBoardId);
  },

  async closeBoard(id) {
    const { boards, activeBoardId, recentlyClosed } = get();
    const board = boards.find((b) => b.id === id);
    if (!board) return;

    // Ghost boards: just discard — nothing on disk
    // Real boards: remove from UI session only, file stays on disk
    const next = boards
      .filter((b) => b.id !== id)
      .map((b, i) => ({ ...b, order: i }));

    const newActiveId =
      activeBoardId === id ? (next[0]?.id ?? null) : activeBoardId;
    const nextRecentlyClosed = board.ghost
      ? recentlyClosed
      : [board, ...recentlyClosed.filter((candidate) => candidate.id !== id)];

    // Only sync persisted boards; closing a ghost doesn't change the index.
    if (!board.ghost) {
      await syncIndex(
        next.filter((b) => !b.ghost),
        newActiveId,
        nextRecentlyClosed.map((candidate) => candidate.id),
        nextRecentlyClosed,
      );
    }

    set({
      boards: next,
      activeBoardId: newActiveId,
      recentlyClosed: nextRecentlyClosed,
    });
  },

  async reopenBoard(id) {
    const { boards, recentlyClosed } = get();
    const board = recentlyClosed.find((candidate) => candidate.id === id);
    if (!board || boards.some((candidate) => candidate.id === id)) return;

    const next = [...boards, { ...board, order: boards.length }];
    const nextRecentlyClosed = recentlyClosed.filter(
      (candidate) => candidate.id !== id,
    );
    await syncIndex(
      next.filter((candidate) => !candidate.ghost),
      board.id,
      nextRecentlyClosed.map((candidate) => candidate.id),
      nextRecentlyClosed,
    );
    set({
      boards: next,
      activeBoardId: board.id,
      recentlyClosed: nextRecentlyClosed,
    });
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  async saveNotes(boardId, notes) {
    const { boards } = get();
    let board = boards.find((b) => b.id === boardId);
    if (!board) return;

    // Materialise ghost on first real content
    if (board.ghost) {
      board = await materialiseBoard(board);
      const next = boards.map((b) => (b.id === boardId ? board! : b));
      set({ boards: next });
      await syncIndex(
        next.filter((b) => !b.ghost),
        boardId,
        get().recentlyClosed.map((b) => b.id),
        get().recentlyClosed,
      );
    }

    const updated = { ...board, notes, updated: new Date().toISOString() };
    await writeBoard(updated);
    set({ boards: get().boards.map((b) => (b.id === boardId ? updated : b)) });
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

    // Persist order changes to each non-ghost file
    await Promise.all(reordered.filter((b) => !b.ghost).map(writeBoard));
    await syncIndex(
      reordered.filter((b) => !b.ghost),
      activeBoardId,
      get().recentlyClosed.map((b) => b.id),
      get().recentlyClosed,
    );
    set({ boards: reordered });
  },
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

/** The currently active Board object, or null. */
export function selectActiveBoard(state: BoardStore): Board | null {
  return state.boards.find((b) => b.id === state.activeBoardId) ?? null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Apply a board mutation (returns a new Board from IO) and update state.
 * Automatically materialises ghost boards before the first real mutation.
 */
async function mutateBoard(
  get: () => BoardStore,
  set: (partial: Partial<BoardState>) => void,
  boardId: string,
  mutate: (board: Board) => Promise<Board>,
): Promise<void> {
  const { boards } = get();
  let board = boards.find((b) => b.id === boardId);
  if (!board) return;

  try {
    // Materialise ghost on first real mutation
    if (board.ghost) {
      board = await materialiseBoard(board);
      const intermediateBoards = get().boards.map((b) =>
        b.id === boardId ? board! : b,
      );
      set({ boards: intermediateBoards });
      await syncIndex(
        intermediateBoards.filter((b) => !b.ghost),
        boardId,
        get().recentlyClosed.map((b) => b.id),
        get().recentlyClosed,
      );
    }

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
