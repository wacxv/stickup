import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useBoardStore } from "../stores/boardStore";
import type { Board } from "../types/board";
import { ConfirmDialog } from "./ConfirmDialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { storagePath } from "../lib/storage";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";

/**
 * BoardTabBar
 *
 * Renders the board tab strip at the top of the window.
 *
 * Behaviour:
 *  - Tabs are laid out horizontally; titles truncate with ellipsis
 *  - When tabs overflow the strip width an "▾ N more" overflow button
 *    appears that opens a dropdown listing the hidden boards
 *  - "+" creates a ghost board (lazy-write) and drops into inline rename
 *  - Right-clicking a tab opens a context menu with:
 *      New | Delete | Open file location | Close
 *  - Clicking a tab activates that board
 *  - Double-clicking a tab activates inline rename
 *  - The active tab shows a bottom accent line
 *  - Ghost boards (not yet on disk) are indicated with an italic title
 */

// ─── Context menu types ───────────────────────────────────────────────────────

interface ContextMenuState {
  boardId: string;
  x: number;
  y: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoardTabBar() {
  const {
    boards,
    activeBoardId,
    setActiveBoard,
    addGhostBoard,
    renameActiveBoard,
    deleteBoardById,
    closeBoard,
  } = useBoardStore();

  // ── Inline rename state ──────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Overflow detection ───────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(boards.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // ── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ── Delete confirmation ───────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Measure how many tabs fit in the strip
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      // Reserve ~72px for the overflow button + add button
      const available = strip.clientWidth - 72;
      const tabEls = Array.from(
        strip.querySelectorAll<HTMLElement>("[data-tab]"),
      );
      let used = 0;
      let count = 0;
      for (const el of tabEls) {
        used += el.offsetWidth;
        if (used > available) break;
        count++;
      }
      setVisibleCount(Math.max(1, count));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [boards]);

  // Close overflow dropdown on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (!overflowRef.current?.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleMouse = (e: globalThis.MouseEvent) => {
      if (!contextMenuRef.current?.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handleMouse);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouse);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // Focus rename input when it mounts
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function startRename(board: Board, initialValue = board.title) {
    setActiveBoard(board.id);
    setRenamingId(board.id);
    setRenameValue(initialValue);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      // Only the active board can be renamed via the tab bar
      if (renamingId === activeBoardId) {
        await renameActiveBoard(trimmed);
      }
    } else {
      // Empty rename on a ghost → close/discard the ghost
      const board = boards.find((b) => b.id === renamingId);
      if (board?.ghost) {
        await closeBoard(renamingId);
      }
    }
    setRenamingId(null);
  }

  function handleRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      // Cancel rename — if this was a fresh ghost, discard it
      const board = boards.find((b) => b.id === renamingId);
      if (board?.ghost) {
        void closeBoard(renamingId!);
      }
      setRenamingId(null);
    }
  }

  /** Create a ghost board and enter rename mode — used by both + and "New". */
  function handleNewBoard() {
    const board = addGhostBoard("New Board");
    // The display label is only a placeholder. An untouched ghost must not
    // materialise merely because the rename input loses focus.
    startRename(board, "");
  }

  function openContextMenu(e: MouseEvent, boardId: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ boardId, x: e.clientX, y: e.clientY });
  }

  // ── Context menu actions ─────────────────────────────────────────────────

  async function ctxOpenFileLocation(boardId: string) {
    setContextMenu(null);
    const board = boards.find((b) => b.id === boardId);
    if (!board || board.ghost) return; // ghost has no file
    try {
      // Build the absolute path to the .md file
      const filePath = await storagePath("boards", `${board.slug}.md`);
      // Reveal the file in Explorer instead of opening it with its associated app.
      await revealItemInDir(filePath);
    } catch (err) {
      console.warn("[BoardTabBar] revealItemInDir failed:", err);
    }
  }

  function ctxNew() {
    setContextMenu(null);
    handleNewBoard();
  }

  function ctxDelete(boardId: string) {
    setContextMenu(null);
    setConfirmDeleteId(boardId);
  }

  async function ctxClose(boardId: string) {
    setContextMenu(null);
    await closeBoard(boardId);
  }

  // ── Confirm delete ───────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    await deleteBoardById(confirmDeleteId);
    setConfirmDeleteId(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const visibleBoards = boards.slice(0, visibleCount);
  const hiddenBoards = boards.slice(visibleCount);

  const confirmTarget = boards.find((b) => b.id === confirmDeleteId);

  return (
    <>
      <div
        ref={stripRef}
        className="
          flex items-stretch shrink-0
          bg-neutral-900 border-b border-neutral-800
          overflow-hidden
        "
        style={{ height: "2rem" /* 32px */ }}
      >
        {/* ── Visible tabs ──────────────────────────────────────────────── */}
        {visibleBoards.map((board) => {
          const isActive = board.id === activeBoardId;
          const isRenaming = board.id === renamingId;

          return (
            <div
              key={board.id}
              data-tab
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => setActiveBoard(board.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveBoard(board.id);
                }
              }}
              onDoubleClick={() => startRename(board)}
              onContextMenu={(e) => openContextMenu(e, board.id)}
              title={board.ghost ? `${board.title} (not yet saved)` : board.title}
              className={`
                group relative flex items-center px-3 max-w-[120px] shrink-0
                text-xs truncate transition-colors
                ${
                  isActive
                    ? "text-neutral-100 bg-neutral-950 after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-indigo-500"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                }
              `}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleRenameKey}
                  onClick={(e) => e.stopPropagation()}
                  className="
                    w-full bg-neutral-800 text-neutral-100 text-xs
                    border border-indigo-500 rounded px-1 outline-none
                    min-w-0
                  "
                />
              ) : (
                <span className={`truncate ${board.ghost ? "italic opacity-70" : ""}`}>
                  {board.title}
                </span>
              )}
              <button
                type="button"
                aria-label={`Close "${board.title}"`}
                title="Close board"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeBoard(board.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    void closeBoard(board.id);
                  }
                }}
                className="
                  ml-1 shrink-0 rounded p-0.5 text-neutral-500 opacity-0
                  transition-opacity hover:bg-neutral-700 hover:text-neutral-100
                  group-hover:opacity-100 focus:opacity-100
                "
              >
                <FiX className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}

        {/* ── Overflow button ───────────────────────────────────────────── */}
        {hiddenBoards.length > 0 && (
          <div ref={overflowRef} className="relative flex items-center">
            <button
              onClick={() => setOverflowOpen((o) => !o)}
              className="
                flex items-center gap-1 px-2 h-full
                text-xs text-neutral-400 hover:text-neutral-200
                hover:bg-neutral-800 transition-colors
              "
            >
              <FiChevronDown aria-hidden="true" />
              <span>{hiddenBoards.length}</span>
            </button>

            {overflowOpen && (
              <div
                className="
                  absolute top-full left-0 z-50 min-w-[140px]
                  bg-neutral-800 border border-neutral-700
                  rounded-md shadow-lg py-1 mt-0.5
                "
              >
                {hiddenBoards.map((board) => (
                  <button
                    key={board.id}
                    onClick={() => {
                      setActiveBoard(board.id);
                      setOverflowOpen(false);
                    }}
                    onContextMenu={(e) => {
                      setOverflowOpen(false);
                      openContextMenu(e, board.id);
                    }}
                    className="
                      w-full text-left px-3 py-1.5 text-xs
                      text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100
                      truncate transition-colors
                    "
                  >
                    {board.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Add board button — browser-style, after the open tabs ─────── */}
        <button
          onClick={handleNewBoard}
          title="New board"
          aria-label="New board"
          className="
            flex items-center justify-center w-8 h-full shrink-0
            text-neutral-400 hover:text-neutral-100
            hover:bg-neutral-800 transition-colors text-base leading-none
          "
        >
          <FiPlus aria-hidden="true" />
        </button>

        <div className="flex-1" />
      </div>

      {/* ── Context menu (portal-style, positioned absolutely in viewport) ── */}
      {contextMenu && (
        <ContextMenu
          ref={contextMenuRef}
          x={contextMenu.x}
          y={contextMenu.y}
          board={boards.find((b) => b.id === contextMenu.boardId)!}
          onNew={ctxNew}
          onDelete={() => ctxDelete(contextMenu.boardId)}
          onOpenLocation={() => ctxOpenFileLocation(contextMenu.boardId)}
          onClose={() => ctxClose(contextMenu.boardId)}
        />
      )}

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
      {confirmDeleteId && confirmTarget && (
        <ConfirmDialog
          title={`Delete "${confirmTarget.title}"?`}
          message={`The board and all its tasks and notes will be permanently removed.`}
          confirmLabel="Delete board"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

import { forwardRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  board: Board;
  onNew: () => void;
  onDelete: () => void;
  onOpenLocation: () => void;
  onClose: () => void;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  function ContextMenu(
    { x, y, board, onNew, onDelete, onOpenLocation, onClose },
    ref,
  ) {
    // Clamp to viewport so the menu never clips off the right/bottom edge
    const menuW = 180;
    const menuH = 136; // approximate: 4 items × 34px
    const left = Math.min(x, window.innerWidth - menuW - 8);
    const top = Math.min(y, window.innerHeight - menuH - 8);

    const itemClass = `
      w-full text-left px-3 py-1.5 text-xs text-neutral-300
      hover:bg-neutral-700 hover:text-neutral-100 transition-colors
      disabled:opacity-40 disabled:cursor-default
    `;

    return (
      <div
        ref={ref}
        style={{ position: "fixed", left, top, zIndex: 300 }}
        className="
          min-w-[180px] bg-neutral-800 border border-neutral-600
          rounded-md shadow-xl py-1
        "
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* New */}
        <button className={itemClass} onClick={onNew}>
          New board
        </button>

        <div className="border-t border-neutral-700 my-1" />

        {/* Open file location — disabled for ghost boards */}
        <button
          className={itemClass}
          onClick={onOpenLocation}
          disabled={!!board?.ghost}
          title={board?.ghost ? "Board not yet saved to disk" : undefined}
        >
          Open file location
        </button>

        {/* Close */}
        <button className={itemClass} onClick={onClose}>
          Close
        </button>

        <div className="border-t border-neutral-700 my-1" />

        {/* Delete — destructive */}
        <button
          className={`${itemClass} text-red-400 hover:text-red-300 hover:bg-red-900/30`}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    );
  },
);
