import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
 *  - A tab-list button opens a dropdown containing all open and recently
 *    closed boards
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

interface ViewportDropdownProps {
  anchorRef: RefObject<HTMLElement | null>;
  align: "left" | "right";
  children: ReactNode;
  className: string;
  role?: "menu";
  ariaLabel?: string;
}

function ViewportDropdown({
  anchorRef,
  align,
  children,
  className,
  role,
  ariaLabel,
}: ViewportDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 4;
      const below = anchorRect.bottom + margin;
      const above = anchorRect.top - menuRect.height - margin;
      const top =
        below + menuRect.height <= window.innerHeight || above < margin
          ? below
          : above;
      const preferredLeft =
        align === "right"
          ? anchorRect.right - menuRect.width
          : anchorRect.left;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        Math.max(margin, window.innerWidth - menuRect.width - margin),
      );

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, anchorRef]);

  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{ position: "fixed", top: position.top, left: position.left }}
      role={role}
      aria-label={ariaLabel}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── Tab drag & reorder animation types ───────────────────────────────────────

interface TabGeometry {
  id: string;
  left: number;
  width: number;
  center: number;
}

interface DragState {
  boardId: string;
  originIndex: number;
  targetIndex: number;
  deltaX: number;
  draggedWidth: number;
  tabGeometries: TabGeometry[];
  slotCenters: number[];
  isDragging: boolean;
  isDropping: boolean;
  targetOffset: number;
}

/**
 * Computes the exact resting center coordinate of the dragged tab for each
 * candidate slot j in [0, N-1], accounting for the varying widths of all tabs.
 */
function computeSlotCenters(
  originIndex: number,
  geometries: TabGeometry[],
): number[] {
  const draggedWidth = geometries[originIndex].width;
  const n = geometries.length;
  const slotCenters: number[] = new Array(n);

  for (let j = 0; j < n; j++) {
    let slotLeft: number;
    if (j === originIndex) {
      slotLeft = geometries[originIndex].left;
    } else if (j < originIndex) {
      slotLeft = geometries[j].left;
    } else {
      // Placed after tab j; all tabs between originIndex+1 and j have shifted left by draggedWidth
      slotLeft = geometries[j].left + geometries[j].width - draggedWidth;
    }
    slotCenters[j] = slotLeft + draggedWidth / 2;
  }

  return slotCenters;
}

/**
 * Finds the slot whose threshold the dragged tab's center has crossed.
 * The threshold between slot j and j+1 is the exact 50% midpoint between
 * the dragged tab's resting center at slot j and slot j+1.
 */
function getTargetIndex(currentCenter: number, slotCenters: number[]): number {
  const n = slotCenters.length;
  let target = 0;
  for (let j = 0; j < n - 1; j++) {
    const threshold = (slotCenters[j] + slotCenters[j + 1]) / 2;
    if (currentCenter >= threshold) {
      target = j + 1;
    } else {
      break;
    }
  }
  return target;
}

function computeTargetOffset(
  originIndex: number,
  targetIndex: number,
  slotCenters: number[],
): number {
  return slotCenters[targetIndex] - slotCenters[originIndex];
}

function getTabShift(
  k: number,
  originIndex: number,
  targetIndex: number,
  draggedWidth: number,
): number {
  if (targetIndex > originIndex) {
    if (k > originIndex && k <= targetIndex) {
      return -draggedWidth;
    }
  } else if (targetIndex < originIndex) {
    if (k >= targetIndex && k < originIndex) {
      return draggedWidth;
    }
  }
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoardTabBar() {
  const {
    boards,
    activeBoardId,
    setActiveBoard,
    reorderBoards,
    addGhostBoard,
    renameActiveBoard,
    deleteBoardById,
    closeBoard,
    recentlyClosed,
    reopenBoard,
  } = useBoardStore();

  // ── Inline rename state ──────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameToast, setRenameToast] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Tab-list and overflow detection ──────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(boards.length);
  const [tabListOpen, setTabListOpen] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);

  // ── Interactive drag & reorder animation state ────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const tabPointerRef = useRef<{
    boardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const suppressTabClickRef = useRef(false);
  const dropTimeoutRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const boardsRef = useRef(boards);
  boardsRef.current = boards;

  // Keep the active board in the main strip. A board selected from the
  // overflow menu may otherwise remain hidden while the first tab still
  // appears to be selected.
  const initialVisibleBoards = boards.slice(0, visibleCount);
  const activeBoard = boards.find((board) => board.id === activeBoardId);
  const activeIsVisible = initialVisibleBoards.some(
    (board) => board.id === activeBoardId,
  );
  const visibleBoards =
    activeBoard && !activeIsVisible && initialVisibleBoards.length > 0
      ? [
          ...initialVisibleBoards.slice(0, -1),
          activeBoard,
        ]
      : initialVisibleBoards;
  const visibleBoardsRef = useRef(visibleBoards);
  visibleBoardsRef.current = visibleBoards;

  const updateDragState = (next: DragState | null) => {
    dragStateRef.current = next;
    setDragState(next);
  };

  useEffect(() => {
    return () => {
      if (dropTimeoutRef.current) {
        window.clearTimeout(dropTimeoutRef.current);
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      document.body.style.cursor = "";
    };
  }, []);

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
      // Measure every board, including tabs currently hidden by overflow.
      const tabEls = Array.from(
        strip.querySelectorAll<HTMLElement>("[data-measure-tab]"),
      );
      // Reserve space for the tab-list button and + button.
      const fixedButtonWidth = 64;

      function fitCount(available: number) {
        let used = 0;
        let count = 0;
        for (const el of tabEls) {
          used += el.offsetWidth;
          if (used > available) break;
          count++;
        }
        return count;
      }

      const count = fitCount(strip.clientWidth - fixedButtonWidth);
      setVisibleCount(Math.max(1, count));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [boards]);

  // Close the tab-list dropdown on outside click
  useEffect(() => {
    if (!tabListOpen) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (!tabListRef.current?.contains(e.target as Node)) {
        setTabListOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tabListOpen]);

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

  useEffect(() => {
    if (!renameToast) return;
    const timeout = window.setTimeout(() => setRenameToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [renameToast]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function startRename(board: Board, initialValue = board.title) {
    setActiveBoard(board.id);
    setRenamingId(board.id);
    setRenameValue(initialValue);
    setRenameError(null);
  }

  function handleTabPointerDown(
    event: PointerEvent<HTMLDivElement>,
    boardId: string,
  ) {
    if (event.button !== 0 || renamingId || dragStateRef.current?.isDropping) return;
    if ((event.target as HTMLElement).closest("button, input")) return;
    if (visibleBoardsRef.current.length <= 1) return;

    suppressTabClickRef.current = false;
    tabPointerRef.current = {
      boardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTabPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pointer = tabPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    const clientX = event.clientX;
    const clientY = event.clientY;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const currentPointer = tabPointerRef.current;
      if (!currentPointer || currentPointer.pointerId !== event.pointerId) return;

      const movedDistance = Math.hypot(
        clientX - currentPointer.startX,
        clientY - currentPointer.startY,
      );

      // Start drag if moved >= 4px threshold
      if (!currentPointer.dragging) {
        if (movedDistance < 4) return;
        const currentVisible = visibleBoardsRef.current;
        if (currentVisible.length <= 1) return;

        const strip = stripRef.current;
        if (!strip) return;

        const geometries: TabGeometry[] = [];
        for (const b of currentVisible) {
          const el = strip.querySelector<HTMLElement>(
            `[data-tab][data-board-id="${b.id}"]`,
          );
          if (el) {
            const rect = el.getBoundingClientRect();
            geometries.push({
              id: b.id,
              left: rect.left,
              width: rect.width,
              center: rect.left + rect.width / 2,
            });
          }
        }

        if (geometries.length !== currentVisible.length) return;

        const originIndex = geometries.findIndex((g) => g.id === currentPointer.boardId);
        if (originIndex < 0) return;

        currentPointer.dragging = true;
        document.body.style.cursor = "grabbing";

        const draggedWidth = geometries[originIndex].width;
        const slotCenters = computeSlotCenters(originIndex, geometries);
        const n = geometries.length;
        const minDeltaX = geometries[0].left - geometries[originIndex].left - 8;
        const maxDeltaX =
          geometries[n - 1].left +
          geometries[n - 1].width -
          draggedWidth -
          geometries[originIndex].left +
          8;

        const rawDeltaX = clientX - currentPointer.startX;
        const deltaX = Math.max(minDeltaX, Math.min(maxDeltaX, rawDeltaX));
        const currentCenter = geometries[originIndex].center + deltaX;
        const targetIndex = getTargetIndex(currentCenter, slotCenters);

        updateDragState({
          boardId: currentPointer.boardId,
          originIndex,
          targetIndex,
          deltaX,
          draggedWidth,
          tabGeometries: geometries,
          slotCenters,
          isDragging: true,
          isDropping: false,
          targetOffset: 0,
        });
        return;
      }

      // Update existing drag
      const currentDrag = dragStateRef.current;
      if (!currentDrag || currentDrag.isDropping) return;

      const { tabGeometries, originIndex, draggedWidth, slotCenters } = currentDrag;
      const n = tabGeometries.length;
      const minDeltaX = tabGeometries[0].left - tabGeometries[originIndex].left - 8;
      const maxDeltaX =
        tabGeometries[n - 1].left +
        tabGeometries[n - 1].width -
        draggedWidth -
        tabGeometries[originIndex].left +
        8;

      const rawDeltaX = clientX - currentPointer.startX;
      const deltaX = Math.max(minDeltaX, Math.min(maxDeltaX, rawDeltaX));
      const currentCenter = tabGeometries[originIndex].center + deltaX;
      const targetIndex = getTargetIndex(currentCenter, slotCenters);

      updateDragState({
        ...currentDrag,
        deltaX,
        targetIndex,
      });
    });
  }

  function handleTabPointerUp(event: PointerEvent<HTMLDivElement>) {
    const pointer = tabPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    document.body.style.cursor = "";

    const activeDrag = dragStateRef.current;
    if (!pointer.dragging || !activeDrag || activeDrag.isDropping) {
      tabPointerRef.current = null;
      updateDragState(null);
      return;
    }

    suppressTabClickRef.current = true;

    const { originIndex, targetIndex, slotCenters } = activeDrag;
    const targetOffset = computeTargetOffset(
      originIndex,
      targetIndex,
      slotCenters,
    );

    updateDragState({
      ...activeDrag,
      isDropping: true,
      targetOffset,
    });

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? 0 : 200;

    dropTimeoutRef.current = window.setTimeout(() => {
      dropTimeoutRef.current = null;
      tabPointerRef.current = null;

      if (targetIndex !== originIndex) {
        const currentVisible = visibleBoardsRef.current;
        const sourceBoard = currentVisible[originIndex];
        const targetBoard = currentVisible[targetIndex];
        if (sourceBoard && targetBoard) {
          const nextOrder = boardsRef.current.map((b) => b.id);
          const srcIdx = nextOrder.indexOf(sourceBoard.id);
          if (srcIdx >= 0) {
            nextOrder.splice(srcIdx, 1);
            let insertIdx = nextOrder.indexOf(targetBoard.id);
            if (targetIndex > originIndex) {
              insertIdx += 1;
            }
            nextOrder.splice(insertIdx, 0, sourceBoard.id);

            // Synchronously clear drag state at the same time as boards reorder
            // so React batches both updates into a single atomic render with no transform overlap
            updateDragState(null);
            void reorderBoards(nextOrder).catch((err) => {
              const message =
                err instanceof Error ? err.message : "Unable to reorder boards.";
              setRenameToast(message);
            });
            return;
          }
        }
      }
      updateDragState(null);
    }, duration);
  }

  function handleTabPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const pointer = tabPointerRef.current;
    if (
      pointer &&
      pointer.pointerId !== undefined &&
      event.currentTarget.hasPointerCapture(pointer.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(pointer.pointerId);
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (dropTimeoutRef.current) {
      window.clearTimeout(dropTimeoutRef.current);
      dropTimeoutRef.current = null;
    }
    document.body.style.cursor = "";
    tabPointerRef.current = null;
    updateDragState(null);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const board = boards.find((b) => b.id === renamingId);
    if (trimmed) {
      // "Untitled" is the in-memory placeholder, not real user content.
      if (board?.ghost && renameValue === "Untitled") {
        // Leaving the placeholder unchanged commits only the rename UI.
        // Keep the ghost available so the user can add notes or tasks.
        setRenamingId(null);
        return;
      }
      // Only the active board can be renamed via the tab bar
      if (renamingId === activeBoardId) {
        try {
          await renameActiveBoard(renameValue);
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : `Unable to rename "${renameValue}".`;
          setRenameError(message);
          setRenameToast(message);
          return;
        }
      }
    } else {
      // Empty rename on a ghost → close/discard the ghost
      if (board?.ghost) {
        await closeBoard(renamingId);
      }
    }
    setRenamingId(null);
    setRenameError(null);
  }

  function handleRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
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
    const board = addGhostBoard("Untitled");
    // Keep the visible Notepad-style placeholder in the input so the tab has
    // a stable width. It is discarded on blur if the user leaves it unchanged.
    startRename(board, "Untitled");
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

  const confirmTarget = boards.find((b) => b.id === confirmDeleteId);

  return (
    <>
      {renameToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-10 left-1/2 z-[100] -translate-x-1/2 rounded border border-red-800 bg-neutral-900 px-3 py-2 text-xs text-red-300 shadow-xl"
        >
          {renameToast}
        </div>
      )}
      <div
        ref={stripRef}
        className="
          flex items-stretch shrink-0
          bg-neutral-900 border-b border-neutral-800
          relative overflow-visible z-10
        "
        style={{ height: "2rem" /* 32px */ }}
      >
        {/* Keep width mirrors for all boards so resizing can recalculate
            overflow even when some tabs are not currently rendered visibly. */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 invisible pointer-events-none flex"
        >
          {boards.map((board) => (
            <div
              key={board.id}
              data-measure-tab
              className="group relative flex items-center px-3 min-w-[72px] max-w-[130px] shrink-0 text-xs"
            >
              <span className="truncate">{board.title}</span>
              <span className="ml-1 shrink-0 p-0.5">
                <FiX className="h-3 w-3" aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>

        {/* ── Tab list button — browser-style, before the open tabs ─────── */}
        <div ref={tabListRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => setTabListOpen((open) => !open)}
            title="Open boards and recently closed boards"
            aria-label="Open boards and recently closed boards"
            aria-expanded={tabListOpen}
            className="
              flex items-center justify-center w-8 h-full shrink-0
              text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800
              transition-colors
            "
          >
            <FiChevronDown aria-hidden="true" />
          </button>

          {tabListOpen && (
            <ViewportDropdown
              anchorRef={tabListRef}
              align="left"
              className="
                z-50 min-w-[220px] max-w-[min(320px,calc(100vw-8px))]
                max-h-[calc(100vh-8px)] overflow-y-auto
                bg-neutral-800 border border-neutral-700 rounded-md
                shadow-lg py-1
              "
              role="menu"
              ariaLabel="Open boards and recently closed boards"
            >
              <div className="px-3 pt-1 pb-1 text-[10px] text-neutral-500">
                Open boards
              </div>
              {boards.map((board) => {
                const isActive = board.id === activeBoardId;
                return (
                  <button
                    key={board.id}
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setActiveBoard(board.id);
                      setTabListOpen(false);
                    }}
                    onContextMenu={(e) => {
                      setTabListOpen(false);
                      openContextMenu(e, board.id);
                    }}
                    className={`
                      w-full text-left px-3 py-1.5 text-xs
                      hover:bg-neutral-700 hover:text-neutral-100
                      truncate transition-colors
                      ${isActive ? "text-neutral-100 bg-neutral-700/60" : "text-neutral-300"}
                    `}
                  >
                    {board.title}
                  </button>
                );
              })}

              {recentlyClosed.length > 0 && (
                <>
                  <div className="mt-1 border-t border-neutral-700 px-3 pt-2 pb-1 text-[10px] text-neutral-500">
                    Recently closed
                  </div>
                  {recentlyClosed.map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void reopenBoard(board.id);
                        setTabListOpen(false);
                      }}
                      className="
                        w-full text-left px-3 py-1.5 text-xs text-neutral-400
                        hover:bg-neutral-700 hover:text-neutral-100
                        truncate transition-colors
                      "
                    >
                      {board.title}
                    </button>
                  ))}
                </>
              )}
            </ViewportDropdown>
          )}
        </div>

        {/* ── Visible tabs ──────────────────────────────────────────────── */}
        {/* Reordering is intentionally confined to this tab strip. A future
            tab tear-off/new-window interaction would be a separate feature. */}
        {visibleBoards.map((board, boardIndex) => {
          const isActive = board.id === activeBoardId;
          const isRenaming = board.id === renamingId;
          const isThisDragging = dragState?.boardId === board.id;
          const isAnyDragging = Boolean(dragState?.isDragging);
          const isThisDropping = isThisDragging && dragState?.isDropping;

          let transformStyle: string | undefined;
          let transitionStyle: string | undefined;
          let zIndexStyle: number | undefined;

          if (isThisDragging && dragState) {
            zIndexStyle = 30;
            if (isThisDropping) {
              transformStyle = `translate3d(${dragState.targetOffset}px, 0, 0) scale(1)`;
              transitionStyle =
                "transform 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms ease, opacity 180ms ease";
            } else {
              transformStyle = `translate3d(${dragState.deltaX}px, -2px, 0) scale(1.03)`;
              transitionStyle = "none";
            }
          } else if (isAnyDragging && dragState) {
            const shift = getTabShift(
              boardIndex,
              dragState.originIndex,
              dragState.targetIndex,
              dragState.draggedWidth,
            );
            transformStyle = `translate3d(${shift}px, 0, 0)`;
            transitionStyle = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
          }

          return (
            <div
              key={board.id}
              data-tab
              data-board-id={board.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              aria-grabbed={isThisDragging}
              style={{
                transform: transformStyle,
                transition: transitionStyle,
                zIndex: zIndexStyle,
                willChange: isAnyDragging ? "transform" : undefined,
              }}
              onClick={() => {
                if (suppressTabClickRef.current) {
                  suppressTabClickRef.current = false;
                  return;
                }
                setActiveBoard(board.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveBoard(board.id);
                } else if (
                  (e.ctrlKey || e.altKey) &&
                  (e.key === "ArrowLeft" || e.key === "ArrowRight")
                ) {
                  e.preventDefault();
                  const currentIndex = boards.findIndex((b) => b.id === board.id);
                  if (currentIndex < 0) return;
                  const targetIdx =
                    e.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
                  if (targetIdx >= 0 && targetIdx < boards.length) {
                    const nextOrder = boards.map((b) => b.id);
                    const [moved] = nextOrder.splice(currentIndex, 1);
                    nextOrder.splice(targetIdx, 0, moved);
                    void reorderBoards(nextOrder);
                  }
                }
              }}
              onDoubleClick={() => startRename(board)}
              onContextMenu={(e) => openContextMenu(e, board.id)}
              onPointerDown={(e) => handleTabPointerDown(e, board.id)}
              onPointerMove={handleTabPointerMove}
              onPointerUp={(e) => void handleTabPointerUp(e)}
              onPointerCancel={handleTabPointerCancel}
              title={
                isAnyDragging
                  ? undefined
                  : board.ghost
                    ? `${board.title} (not yet saved)`
                    : board.title
              }
              className={`
                group relative flex items-center rounded-t-md px-3 min-w-[72px] max-w-[130px] shrink-0
                text-xs truncate select-none
                ${
                  isThisDragging
                    ? isThisDropping
                      ? "cursor-default shadow-lg shadow-black/50 ring-1 ring-indigo-500/60 bg-neutral-800 text-neutral-100"
                      : "cursor-grabbing shadow-2xl shadow-black/80 ring-1 ring-indigo-500/80 bg-neutral-800 text-neutral-100"
                    : "cursor-grab"
                }
                ${isAnyDragging && !isThisDragging ? "pointer-events-none" : ""}
                ${
                  isActive
                    ? "text-neutral-100 bg-neutral-950 after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-indigo-500"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                }
              `}
            >
              {isRenaming ? (
                <>
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
                  {renameError && (
                    <span
                      role="alert"
                      className="absolute top-full left-0 z-20 mt-1 w-48 rounded border border-red-800 bg-neutral-900 px-2 py-1 text-[10px] leading-tight text-red-300 shadow-lg"
                    >
                      {renameError}
                    </span>
                  )}
                </>
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
                onPointerDown={(e) => e.stopPropagation()}
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
                  group-hover:opacity-100 focus:opacity-100 cursor-pointer
                "
              >
                <FiX className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}

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
