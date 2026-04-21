'use client';

import { useCallback, useState } from 'react';

/**
 * Shared bulk-selection pattern used by feed-list + youtube-feed.
 *
 * Manages two pieces of state that always move together:
 * 1. `selectMode` — whether the user is currently picking items.
 * 2. `selectedIds` — set of item ids currently selected.
 *
 * Both screens need:
 *   - Toggle single item in/out of the set (per-row checkbox).
 *   - Select all / clear all against a list of ids.
 *   - Enter / exit select mode (exit always clears the set to avoid stale
 *     selections leaking back when the user re-enters select mode later).
 *
 * Keeping this logic here ensures the two screens stay behaviorally in sync
 * — e.g. "exit select mode always resets" is enforced once.
 */
export function useBulkSelection() {
  const [selectMode, setSelectModeState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** Toggle a single id in/out of the selected set. */
  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Select every id in `ids`. Does not change select mode. */
  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  /** Clear selection (keeps select mode on). */
  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /**
   * Remove a single id from the selection (no-op if not present).
   * Use this when the underlying item disappears (e.g. user deleted it from a
   * per-row action) and you want to drop any stale selection of it.
   */
  const deselect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /**
   * If currently all `ids` are selected, clear. Otherwise select every id.
   * Used by the "Select all / Clear all" button in the select-mode bar.
   */
  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, []);

  /** Enter select mode (keeps existing selection). */
  const enterSelectMode = useCallback(() => {
    setSelectModeState(true);
  }, []);

  /** Exit select mode and drop the selection. */
  const exitSelectMode = useCallback(() => {
    setSelectModeState(false);
    setSelectedIds(new Set());
  }, []);

  /**
   * Flip select mode. Entering preserves selection (empty at start), leaving
   * always clears so that stale ids don't re-appear the next time.
   */
  const toggleSelectMode = useCallback(() => {
    setSelectModeState((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  return {
    selectMode,
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    deselect,
    selectAll,
    clear,
    toggleSelectAll,
    enterSelectMode,
    exitSelectMode,
    toggleSelectMode,
  };
}
