import {useEffect, useRef} from 'react';

/**
 * Reusable infinite-scroll hook built on IntersectionObserver.
 *
 * Attach the returned `sentinelRef` to a DOM element rendered at the bottom of
 * the list — once it enters the viewport (offset by `rootMargin`), the hook
 * fires `onLoadMore`, but only while `hasMore` is true, `loading` is false and
 * the hook is not `disabled`. The observer is re-created whenever any of
 * these inputs change so it always reflects the caller's latest state.
 *
 * Rationale: `feed-list` and `youtube-feed` carried near-identical copies of
 * this pattern. Extracting it removes duplication and gives a single well-
 * tested surface for the observer lifecycle.
 */
export interface UseInfiniteScrollOptions {
  /** Whether more pages remain (drives whether the observer is even wired up). */
  hasMore: boolean;
  /** While true, intersection events are ignored (prevents double-fetches). */
  loading: boolean;
  /** Called when the sentinel enters view and conditions allow loading. */
  onLoadMore: () => void;
  /**
   * IntersectionObserver rootMargin (e.g. `'200px'`, `'400px'`).
   * Controls how early the next page begins loading before the sentinel
   * is actually visible. Defaults to `200px`.
   */
  rootMargin?: string;
  /** Short-circuit — skip wiring the observer entirely (e.g. empty list). */
  disabled?: boolean;
}

export interface UseInfiniteScrollReturn {
  /** Attach to the sentinel element at the bottom of your list. */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '200px',
  disabled = false,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Keep onLoadMore in a ref so callers don't have to memoize it — we read
  // the latest callback at intersection time without re-creating the observer
  // every render.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (disabled || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loading) {
          onLoadMoreRef.current();
        }
      },
      {rootMargin},
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, disabled, rootMargin]);

  return {sentinelRef};
}
