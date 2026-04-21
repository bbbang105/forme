/**
 * Behavior contract for the shared bulk-selection hook consumed by both
 * feed-list and youtube-feed. Locks the two invariants that matter:
 *   1. exiting select mode always drops the selection (no stale ids leaking
 *      back when the user re-enters select mode later),
 *   2. toggleSelectAll flips based on the `ids` argument, not on internal
 *      state — so "Clear all / Select all" stays correct when the ids list
 *      changes between renders.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBulkSelection } from '@/hooks/use-bulk-selection';

describe('useBulkSelection', () => {
  it('toggles a single id in and out of the set', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => { result.current.toggle('a'); });
    expect(result.current.selectedIds.has('a')).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    act(() => { result.current.toggle('a'); });
    expect(result.current.selectedIds.has('a')).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('toggleSelectAll selects all when not fully selected, clears when fully selected', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => { result.current.toggleSelectAll(['a', 'b', 'c']); });
    expect(result.current.selectedCount).toBe(3);

    // Same list → now fully selected → clear.
    act(() => { result.current.toggleSelectAll(['a', 'b', 'c']); });
    expect(result.current.selectedCount).toBe(0);
  });

  it('deselect removes a single id (no-op if absent)', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => { result.current.selectAll(['a', 'b']); });
    expect(result.current.selectedCount).toBe(2);

    act(() => { result.current.deselect('a'); });
    expect(result.current.selectedIds.has('a')).toBe(false);
    expect(result.current.selectedIds.has('b')).toBe(true);

    // Not present — snapshot identity stays.
    act(() => { result.current.deselect('nope'); });
    expect(result.current.selectedCount).toBe(1);
  });

  it('exitSelectMode clears selection even if items were picked', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => {
      result.current.enterSelectMode();
      result.current.selectAll(['x', 'y']);
    });
    expect(result.current.selectMode).toBe(true);
    expect(result.current.selectedCount).toBe(2);

    act(() => { result.current.exitSelectMode(); });
    expect(result.current.selectMode).toBe(false);
    // No stale ids — this is the invariant both feed-list and youtube-feed
    // depend on when the user re-enters select mode later.
    expect(result.current.selectedCount).toBe(0);
  });

  it('toggleSelectMode: enter keeps selection, leave clears it', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => { result.current.selectAll(['a']); });

    act(() => { result.current.toggleSelectMode(); });
    expect(result.current.selectMode).toBe(true);
    expect(result.current.selectedCount).toBe(1); // selection preserved while entering

    act(() => { result.current.toggleSelectMode(); });
    expect(result.current.selectMode).toBe(false);
    expect(result.current.selectedCount).toBe(0); // cleared on leave
  });
});
