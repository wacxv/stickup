/**
 * TaskFilters
 *
 * Sort-by-due toggle + priority and recurrence filter chips.
 *
 * Layout:
 *  - Wide (≥ 400 px): chips displayed inline
 *  - Narrow (< 400 px): all filters collapse into a "⚙ Filters" popover
 *
 * The popover uses the same named container query (@[400px]/app) as the
 * rest of the app.
 */

import { useRef, useEffect, useState } from "react";
import type { Priority, Recurrence } from "../types/task";
import type { FilterPriority, FilterRecurrence } from "../lib/taskHelpers";
import { PRIORITY_LABELS, RECURRENCE_LABELS } from "../lib/taskHelpers";
import { FiSliders } from "react-icons/fi";

interface Props {
  sortByDue: boolean;
  onSortByDue: (v: boolean) => void;
  filterPriority: FilterPriority;
  onFilterPriority: (v: FilterPriority) => void;
  filterRecurrence: FilterRecurrence;
  onFilterRecurrence: (v: FilterRecurrence) => void;
}

export function TaskFilters({
  sortByDue,
  onSortByDue,
  filterPriority,
  onFilterPriority,
  filterRecurrence,
  onFilterRecurrence,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setPopoverOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const hasActiveFilters =
    sortByDue || filterPriority !== "all" || filterRecurrence !== "all";

  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800">

      {/* ── Inline chips — hidden at narrow ─────────────────────────── */}
      <div className="@[400px]/app:flex hidden items-center gap-1 flex-wrap">
        <FilterChips
          sortByDue={sortByDue}
          onSortByDue={onSortByDue}
          filterPriority={filterPriority}
          onFilterPriority={onFilterPriority}
          filterRecurrence={filterRecurrence}
          onFilterRecurrence={onFilterRecurrence}
        />
      </div>

      {/* ── Popover trigger — shown only at narrow ───────────────────── */}
      <div ref={popoverRef} className="@[400px]/app:hidden relative">
        <button
          onClick={() => setPopoverOpen((o) => !o)}
          className={`
            flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors
            ${hasActiveFilters
              ? "bg-indigo-600/30 text-indigo-300"
              : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}
          `}
        >
          <FiSliders aria-hidden="true" />
          <span>Filters{hasActiveFilters ? " •" : ""}</span>
        </button>

        {popoverOpen && (
          <div className="
            absolute top-full left-0 z-50 mt-1 p-3
            bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl
            min-w-[200px] flex flex-col gap-2
          ">
            <FilterChips
              sortByDue={sortByDue}
              onSortByDue={onSortByDue}
              filterPriority={filterPriority}
              onFilterPriority={onFilterPriority}
              filterRecurrence={filterRecurrence}
              onFilterRecurrence={onFilterRecurrence}
            />
          </div>
        )}
      </div>

      {/* ── Clear filters ────────────────────────────────────────────── */}
      {hasActiveFilters && (
        <button
          onClick={() => {
            onSortByDue(false);
            onFilterPriority("all");
            onFilterRecurrence("all");
          }}
          className="ml-auto text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Shared chip set (used in both inline and popover) ────────────────────────

function FilterChips({
  sortByDue,
  onSortByDue,
  filterPriority,
  onFilterPriority,
  filterRecurrence,
  onFilterRecurrence,
}: Omit<Props, never>) {
  return (
    <>
      {/* Sort by due */}
      <Chip
        active={sortByDue}
        onClick={() => onSortByDue(!sortByDue)}
        label="Sort: due"
      />

      {/* Priority filter */}
      {(["all", "high", "standard", "low"] as FilterPriority[]).map((p) => (
        <Chip
          key={p}
          active={filterPriority === p}
          onClick={() => onFilterPriority(p)}
          label={p === "all" ? "All" : PRIORITY_LABELS[p as Priority]}
        />
      ))}

      <span className="text-neutral-700 select-none">│</span>

      {/* Recurrence filter */}
      {(["all", "none", "daily", "weekly"] as FilterRecurrence[]).map((r) => (
        <Chip
          key={r}
          active={filterRecurrence === r}
          onClick={() => onFilterRecurrence(r)}
          label={r === "all" ? "Any" : RECURRENCE_LABELS[r as Recurrence]}
        />
      ))}
    </>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        text-[10px] px-2 py-0.5 rounded-full transition-colors
        ${active
          ? "bg-indigo-600/40 text-indigo-300 ring-1 ring-indigo-500/50"
          : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"}
      `}
    >
      {label}
    </button>
  );
}
