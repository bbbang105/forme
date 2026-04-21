import {useCallback} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';

/**
 * Shared filter-to-URL sync hook.
 *
 * `feed-list` and `youtube-feed` both maintained `updateFilter` /
 * `updateFilters` helpers that merged a patch onto the current
 * `searchParams` and called `router.push`. Extracting it here removes
 * copy-pasted URLSearchParams code.
 *
 * Patch semantics:
 *  - string value → set the key
 *  - `null` / `undefined` → delete the key
 *
 * Keys not present in the patch are preserved so feature-specific callers
 * can update one filter at a time without losing the others.
 */
export interface UseFilterSyncOptions {
  /** Destination path, e.g. `/feed` or `/youtube`. */
  basePath: string;
  /**
   * When true, `router.push` is called with `{scroll: false}` to preserve
   * the current scroll position (matches the previous `feed-list` behaviour).
   */
  preserveScroll?: boolean;
}

export interface UseFilterSyncReturn {
  updateFilter: (patch: Record<string, string | null | undefined>) => void;
}

export function useFilterSync({
  basePath,
  preserveScroll = false,
}: UseFilterSyncOptions): UseFilterSyncReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      const url = qs ? `${basePath}?${qs}` : basePath;
      if (preserveScroll) {
        router.push(url, {scroll: false});
      } else {
        router.push(url);
      }
    },
    [basePath, preserveScroll, router, searchParams],
  );

  return {updateFilter};
}
