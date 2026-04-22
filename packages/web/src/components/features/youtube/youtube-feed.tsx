'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Loader2, MailX, Plus, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {SectionHeader} from '@/components/ui/section-header';
import {type YoutubeSource, YoutubeSourceBar} from './youtube-source-bar';
import {CollectProgress} from './collect-progress';
import {
    YoutubeCard,
    YoutubeCompactRow,
    YoutubeListRow,
    type YoutubeItemData,
} from './youtube-card';
import {
    YoutubeFilterBar,
    type YoutubePeriod,
    type YoutubeStatus,
    type YoutubeTab,
} from './youtube-filter-bar';
import {YoutubeFeedSkeleton} from './youtube-feed-skeleton';
import {YOUTUBE_SUMMARIZE_BATCH_MAX} from '@/lib/constants';
import {YOUTUBE_VIDEO_ID_REGEX} from '@/lib/validators';
import {AddUrlDialog} from './add-url-dialog';
import {useInfiniteScroll} from '@/hooks/use-infinite-scroll';
import {useFilterSync} from '@/hooks/use-filter-sync';
import {useBulkSelection} from '@/hooks/use-bulk-selection';

const MAX_PINNED = 3;

const MAIN_TABS: {value: YoutubeTab; label: string}[] = [
  {value: 'feed', label: 'Feed'},
  {value: 'create', label: 'Collect'},
];

export function YoutubeFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {updateFilter: updateFilterBase} = useFilterSync({basePath: '/youtube'});
  const tab = (searchParams.get('tab') as YoutubeTab) || 'feed';
  const status = (searchParams.get('status') as YoutubeStatus) || 'unread';
  const activeSourceId = searchParams.get('sourceId') || '';
  const activeTag = searchParams.get('tag') || '';
  const searchQuery = searchParams.get('search') || '';

  // Data state
  const [sources, setSources] = useState<YoutubeSource[]>([]);
  const [items, setItems] = useState<YoutubeItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Collect SSE state
  const [collectPeriod, setCollectPeriod] = useState<YoutubePeriod>('7d');
  const [collectActive, setCollectActive] = useState(false);

  // Selection mode (shared)
  const {
    selectMode,
    selectedIds,
    toggle: toggleSelectedId,
    deselect: deselectId,
    toggleSelectAll,
    toggleSelectMode,
    exitSelectMode,
  } = useBulkSelection();

  // Summarize progress
  const [summarizeProgress, setSummarizeProgress] = useState<{
    total: number;
    results: {videoId: string; title: string; status: 'summarizing' | 'summarized' | 'failed'; error?: string}[];
  } | null>(null);

  // Delete / bulk state
  const [deleteTarget, setDeleteTarget] = useState<YoutubeItemData | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkUnreading, setBulkUnreading] = useState(false);
  const [showBulkUnread, setShowBulkUnread] = useState(false);

  // Pinned items (Saved tab first page only)
  const [pinnedItems, setPinnedItems] = useState<YoutubeItemData[]>([]);
  const [showAddUrl, setShowAddUrl] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fetchedKeyRef = useRef<string | null>(null);

  const favoriteSources = useMemo(() => sources.filter((s) => s.isFavorite), [sources]);
  const availableTags = useMemo(() => [...new Set(sources.flatMap((s) => s.tags ?? []))], [sources]);
  const sourceTagMap = useMemo(() => new Map(sources.map((s) => [s.id, s.tags ?? []])), [sources]);

  const isCreateTab = tab === 'create';
  const isFeedTab = tab === 'feed';
  const isBookmarkStatus = isFeedTab && status === 'bookmarked';
  const pinLocked = pinnedItems.length >= MAX_PINNED;
  const showMemo = isFeedTab && (status === 'read' || status === 'bookmarked');

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Local search (debounced)
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    return () => clearTimeout(searchTimerRef.current);
  }, []);

  const queryKey = `${tab}|${status}|${activeSourceId}|${activeTag}|${searchQuery}`;

  const fetchSources = useCallback(async () => {
    const res = await fetch('/api/youtube/sources');
    if (res.ok) {
      const data: YoutubeSource[] = await res.json();
      setSources(data);
    }
  }, []);

  const fetchItems = useCallback(
    async (opts: {reset?: boolean; nextCursor?: string | null} = {}) => {
      const {reset = false, nextCursor = null} = opts;

      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({tab});
        if (isFeedTab) params.set('status', status);
        if (activeSourceId) params.set('sourceId', activeSourceId);
        if (activeTag) params.set('tag', activeTag);
        if (searchQuery) params.set('search', searchQuery);
        if (!reset && nextCursor) params.set('cursor', nextCursor);

        const res = await fetch(`/api/youtube/items?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        if (reset) setPinnedItems(data.pinnedItems ?? []);
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, status, activeSourceId, activeTag, searchQuery, isFeedTab],
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    if (fetchedKeyRef.current === queryKey) return;
    fetchedKeyRef.current = queryKey;
    setItems([]);
    setCursor(null);
    exitSelectMode();
    fetchItems({reset: true});
  }, [queryKey, fetchItems, exitSelectMode]);

  const {sentinelRef} = useInfiniteScroll({
    hasMore,
    loading: loadingMore || loading,
    onLoadMore: () => {
      if (cursor) fetchItems({reset: false, nextCursor: cursor});
    },
    rootMargin: '200px',
  });

  const updateFilter = useCallback(
    (updates: Record<string, string | null>) => {
      fetchedKeyRef.current = null;
      updateFilterBase(updates);
    },
    [updateFilterBase],
  );

  const updateFilterRef = useRef(updateFilter);
  useEffect(() => {
    updateFilterRef.current = updateFilter;
  }, [updateFilter]);

  const handleSearchChange = useCallback((v: string) => {
    setLocalSearch(v);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => updateFilterRef.current({search: v || null}), 300);
  }, []);

  const handleSearchClear = useCallback(() => {
    setLocalSearch('');
    updateFilter({search: null});
  }, [updateFilter]);

  const handleTabSwitch = useCallback(
    (newTab: YoutubeTab) => {
      clearTimeout(searchTimerRef.current);
      updateFilter({
        tab: newTab,
        status: null,
        sourceId: null,
        tag: null,
        search: null,
      });
    },
    [updateFilter],
  );

  const handleStatusSwitch = useCallback(
    (newStatus: YoutubeStatus) => {
      updateFilter({status: newStatus});
    },
    [updateFilter],
  );

  const handleAddSource = async (channelUrl: string) => {
    const res = await fetch('/api/youtube/sources', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({channelUrl}),
    });
    if (!res.ok) {
      let message = '등록 실패';
      try {
        const data = await res.json();
        message = data.error || message;
      } catch {
        /* */
      }
      throw new Error(message);
    }
    await fetchSources();
  };

  const handleDeleteSource = async (id: string) => {
    const res = await fetch(`/api/youtube/sources/${id}`, {method: 'DELETE'});
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const handleStartCollect = () => {
    if (sources.length === 0) return;
    setCollectActive(true);
  };

  const handleCollectComplete = () => {
    setCollectActive(false);
    fetchedKeyRef.current = null;
    if (isCreateTab) {
      fetchItems({reset: true});
    } else {
      handleTabSwitch('create');
    }
  };

  // Refs for items/pinnedItems (stale-closure safety)
  const itemsRef = useRef(items);
  const pinnedItemsRef = useRef(pinnedItems);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    pinnedItemsRef.current = pinnedItems;
  }, [pinnedItems]);

  const handleSelect = useCallback(
    (id: string) => {
      toggleSelectedId(id);
    },
    [toggleSelectedId],
  );

  const handleCardClick = useCallback(
    async (id: string) => {
      const item =
        itemsRef.current.find((i) => i.id === id) ?? pinnedItemsRef.current.find((i) => i.id === id);
      if (!item) return;

      if (!item.isRead) {
        setItems((prev) => prev.map((i) => (i.id === id ? {...i, isRead: true} : i)));
        setPinnedItems((prev) => prev.map((i) => (i.id === id ? {...i, isRead: true} : i)));
        fetch(`/api/youtube/${id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({isRead: true}),
        }).catch(() => {
          setItems((prev) => prev.map((i) => (i.id === id ? {...i, isRead: false} : i)));
          setPinnedItems((prev) => prev.map((i) => (i.id === id ? {...i, isRead: false} : i)));
        });
      }

      if (item.status === 'summarized') {
        router.push(`/youtube/${id}`);
      } else if (YOUTUBE_VIDEO_ID_REGEX.test(item.videoId)) {
        window.open(`https://www.youtube.com/watch?v=${item.videoId}`, '_blank', 'noopener');
      } else {
        console.warn('[youtube-feed] Invalid videoId, skipping open:', item.videoId);
      }
    },
    [router],
  );

  const handleToggleBookmark = useCallback(async (id: string) => {
    const item =
      itemsRef.current.find((i) => i.id === id) ?? pinnedItemsRef.current.find((i) => i.id === id);
    if (!item) return;

    if (!item.isBookmarked) {
      setItems((prev) => prev.map((i) => (i.id === id ? {...i, isBookmarked: true} : i)));
      try {
        const res = await fetch(`/api/youtube/${id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({isBookmarked: true}),
        });
        if (!res.ok) throw new Error();
      } catch {
        setItems((prev) => prev.map((i) => (i.id === id ? {...i, isBookmarked: false} : i)));
      }
      return;
    }

    // Unbookmark — also unpins (server mirrors). Snapshot both lists so a
    // failed request restores the pinned entry at its original position.
    const prevPinnedItems = pinnedItemsRef.current;
    const prevItems = itemsRef.current;
    setPinnedItems((prev) => prev.filter((i) => i.id !== id));
    setItems((prev) =>
      prev.map((i) => (i.id === id ? {...i, isBookmarked: false, pinnedAt: null} : i)),
    );
    try {
      const res = await fetch(`/api/youtube/${id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({isBookmarked: false}),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPinnedItems(prevPinnedItems);
      setItems(prevItems);
    }
  }, []);

  const handleMemoChange = useCallback(async (id: string, note: string | null) => {
    const item =
      itemsRef.current.find((i) => i.id === id) ?? pinnedItemsRef.current.find((i) => i.id === id);
    const prevMemo = item?.note ?? null;
    const wasBookmarked = item?.isBookmarked ?? false;

    const apply = (list: YoutubeItemData[]) =>
      list.map((i) =>
        i.id === id ? {...i, note, isBookmarked: note ? true : i.isBookmarked} : i,
      );
    setItems(apply);
    setPinnedItems(apply);

    try {
      const res = await fetch(`/api/youtube/${id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({note}),
      });
      if (!res.ok) throw new Error();
    } catch {
      const revert = (list: YoutubeItemData[]) =>
        list.map((i) => (i.id === id ? {...i, note: prevMemo, isBookmarked: wasBookmarked} : i));
      setItems(revert);
      setPinnedItems(revert);
    }
  }, []);

  const handleTogglePin = useCallback(async (id: string, nextPinned: boolean) => {
    if (
      nextPinned &&
      pinnedItemsRef.current.length >= MAX_PINNED &&
      !pinnedItemsRef.current.some((p) => p.id === id)
    ) {
      return;
    }
    const nowIso = new Date().toISOString();

    const prevItems = itemsRef.current;
    const prevPinnedItems = pinnedItemsRef.current;

    if (nextPinned) {
      const source = itemsRef.current.find((i) => i.id === id);
      if (source) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setPinnedItems((prev) => [{...source, pinnedAt: nowIso, isBookmarked: true}, ...prev]);
      } else {
        setPinnedItems((prev) =>
          prev.map((i) => (i.id === id ? {...i, pinnedAt: nowIso} : i)),
        );
      }
    } else {
      const source = pinnedItemsRef.current.find((i) => i.id === id);
      if (source) {
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
        setItems((prev) => [{...source, pinnedAt: null}, ...prev]);
      }
    }

    try {
      const res = await fetch(`/api/youtube/${id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({pinned: nextPinned}),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prevItems);
      setPinnedItems(prevPinnedItems);
    }
  }, []);

  const handleSummarize = async () => {
    if (selectedIds.size === 0) return;
    setSummarizing(true);
    setSummarizeProgress({total: selectedIds.size, results: []});

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setItems((prev) =>
      prev.map((item) => (selectedIds.has(item.id) ? {...item, status: 'summarizing'} : item)),
    );

    try {
      const res = await fetch('/api/youtube/summarize', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({itemIds: Array.from(selectedIds)}),
        signal: controller.signal,
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const {done, value} = await reader.read();
          if (done) break;

          const text = decoder.decode(value, {stream: true});
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.videoId && data.status) {
                  const uiStatus = data.status === 'failed' ? 'collected' : data.status;
                  setItems((prev) =>
                    prev.map((item) =>
                      item.videoId === data.videoId ? {...item, status: uiStatus} : item,
                    ),
                  );
                  if (data.status === 'summarized' || data.status === 'failed') {
                    setSummarizeProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            results: [
                              ...prev.results,
                              {
                                videoId: data.videoId,
                                title: data.title ?? '',
                                status: data.status,
                                error: data.error,
                              },
                            ],
                          }
                        : prev,
                    );
                  }
                }
              } catch {
                /* */
              }
            }
          }
        }
      }

      exitSelectMode();
    } finally {
      setSummarizing(false);
    }
  };

  const handleDeleteItem = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/youtube/${id}`, {method: 'DELETE'});
      if (res.ok || res.status === 204) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
        deselectId(id);
      }
    },
    [deselectId],
  );

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/youtube/bulk-action', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({itemIds: Array.from(selectedIds), action: 'delete'}),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
        setPinnedItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
        exitSelectMode();
      }
    } finally {
      setBulkDeleting(false);
      setShowBulkDelete(false);
    }
  };

  const handleBulkMarkUnread = async () => {
    if (selectedIds.size === 0) return;
    setBulkUnreading(true);
    try {
      const res = await fetch('/api/youtube/bulk-action', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({itemIds: Array.from(selectedIds), action: 'mark_unread'}),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
        exitSelectMode();
      }
    } finally {
      setBulkUnreading(false);
      setShowBulkUnread(false);
    }
  };

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteTarget(
      itemsRef.current.find((i) => i.id === id) ??
        pinnedItemsRef.current.find((i) => i.id === id) ??
        null,
    );
  }, []);

  const getSourceTag = useCallback(
    (sourceId: string | null): string | null => {
      if (!sourceId) return null;
      const tags = sourceTagMap.get(sourceId);
      return tags && tags.length > 0 ? tags[0]! : null;
    },
    [sourceTagMap],
  );

  const isEmpty = items.length === 0 && pinnedItems.length === 0;

  // Editorial empty-state copy
  const emptyCopy = (() => {
    if (isCreateTab) {
      return {
        eyebrow: 'Nothing here',
        title: '수집된 영상이 없어요.',
        hint: sources.length === 0 ? '우측 Sources 버튼으로 채널을 등록해보세요.' : '기간을 선택하고 Collect 를 눌러보세요.',
      };
    }
    if (status === 'unread') return {eyebrow: 'Nothing here', title: '안읽은 요약이 없어요.', hint: 'Collect 탭에서 영상을 요약해보세요.'};
    if (status === 'read') return {eyebrow: 'Nothing here', title: '읽은 요약이 없어요.', hint: null};
    if (status === 'bookmarked') return {eyebrow: 'Nothing here', title: '북마크한 영상이 없어요.', hint: null};
    return {eyebrow: 'Nothing here', title: '영상이 없어요.', hint: null};
  })();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto space-y-6 pb-24">
      {/* ── Main tabs (Feed / Collect) ── */}
      <div
        role="tablist"
        aria-label="유튜브 모드"
        className="flex items-center gap-6 border-b border-border overflow-x-auto scrollbar-hide"
      >
        {MAIN_TABS.map(({value, label}) => {
          const isActive = tab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabSwitch(value)}
              className={cn(
                'py-3 font-mono text-[11px] uppercase tracking-[0.12em] whitespace-nowrap',
                '-mb-px border-b-2 transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>


      {/* ── Filter bar ── */}
      <YoutubeFilterBar
        tab={tab}
        availableTags={availableTags}
        activeTag={activeTag}
        onTagChange={(t) => updateFilter({tag: t || null})}
        status={isFeedTab ? status : undefined}
        onStatusChange={isFeedTab ? handleStatusSwitch : undefined}
        period={isCreateTab ? collectPeriod : undefined}
        onPeriodChange={isCreateTab ? setCollectPeriod : undefined}
        onStartCollect={isCreateTab ? handleStartCollect : undefined}
        canCollect={sources.length > 0}
        isCollecting={collectActive}
        search={isFeedTab ? localSearch : undefined}
        onSearchChange={isFeedTab ? handleSearchChange : undefined}
        onSearchClear={isFeedTab ? handleSearchClear : undefined}
        favoriteSources={favoriteSources.map((s) => ({id: s.id, channelName: s.channelName}))}
        activeSourceId={activeSourceId}
        onSourceIdChange={(id) => updateFilter({sourceId: id || null})}
        feedStatusActions={
          isFeedTab && (
            <>
              {!loading && items.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className={cn(
                    'shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm px-1',
                    selectMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddUrl(true)}
                className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="YouTube URL 직접 추가"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <YoutubeSourceBar
                sources={sources}
                onAdd={handleAddSource}
                onDelete={handleDeleteSource}
                onUpdate={fetchSources}
                compact
              />
            </>
          )
        }
        collectRowActions={
          isCreateTab && !collectActive && (
            <>
              {!loading && items.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className={cn(
                    'shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm px-1',
                    selectMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <YoutubeSourceBar
                sources={sources}
                onAdd={handleAddSource}
                onDelete={handleDeleteSource}
                onUpdate={fetchSources}
                compact
              />
            </>
          )
        }
      />

      {/* ── Collect SSE in-flight ── */}
      {isCreateTab && collectActive && (
        <CollectProgress
          sourceIds={sources.filter((s) => s.isActive).map((s) => s.id)}
          period={collectPeriod}
          onComplete={handleCollectComplete}
          onClose={() => setCollectActive(false)}
        />
      )}

      {/* ── Select mode action bar (editorial hairline) ── */}
      {selectMode && (
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-baseline gap-4">
            <button
              type="button"
              onClick={() => toggleSelectAll(items.map((i) => i.id))}
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              {selectedIds.size === items.length ? 'Clear all' : 'Select all'}
            </button>
            <span
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-primary" aria-hidden="true">—</span>{' '}
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : isCreateTab
                  ? '요약할 영상을 선택하세요'
                  : '선택한 항목 없음'}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {isCreateTab && (
                <Button
                  size="sm"
                  onClick={handleSummarize}
                  disabled={summarizing || selectedIds.size > YOUTUBE_SUMMARIZE_BATCH_MAX}
                >
                  {summarizing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                      요약 중…
                    </>
                  ) : selectedIds.size > YOUTUBE_SUMMARIZE_BATCH_MAX ? (
                    `최대 ${YOUTUBE_SUMMARIZE_BATCH_MAX}개`
                  ) : (
                    `${selectedIds.size}개 요약`
                  )}
                </Button>
              )}
              {isFeedTab && status === 'read' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkUnread(true)}
                  disabled={bulkUnreading}
                >
                  <MailX className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {bulkUnreading ? '이동 중…' : '안읽음으로'}
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDelete(true)}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                )}
                {bulkDeleting ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Summarize progress ── */}
      {summarizeProgress && (
        <div
          className="rounded-lg border border-border bg-card p-4 space-y-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {summarizing
                ? `요약 중... (${summarizeProgress.results.length}/${summarizeProgress.total})`
                : '요약 완료'}
            </p>
            {!summarizing && (
              <button
                type="button"
                onClick={() => {
                  setSummarizeProgress(null);
                  fetchedKeyRef.current = null;
                  fetchItems({reset: true});
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                닫기
              </button>
            )}
          </div>

          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${(summarizeProgress.results.length / summarizeProgress.total) * 100}%`,
              }}
            />
          </div>

          <div className="space-y-1.5">
            {summarizeProgress.results.map((r) => (
              <div key={r.videoId} className="flex items-start gap-2 text-xs">
                {r.status === 'summarized' ? (
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                ) : (
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-destructive/20 text-destructive flex items-center justify-center text-[10px]">
                    ✕
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-foreground">{r.title}</p>
                  {r.status === 'failed' && r.error && (
                    <p className="text-destructive/80 mt-0.5">{r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feed body ── */}
      {loading ? (
        <YoutubeFeedSkeleton tab={tab} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center max-w-sm mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
            <span className="text-primary" aria-hidden="true">—</span> {emptyCopy.eyebrow}
          </p>
          <p className="font-display text-2xl leading-snug text-foreground">{emptyCopy.title}</p>
          {emptyCopy.hint && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{emptyCopy.hint}</p>
          )}
        </div>
      ) : isBookmarkStatus ? (
        // Saved tab: pinned grid + masonry
        <>
          {pinnedItems.length > 0 && (
            <section className="mb-10">
              <SectionHeader
                eyebrow={`Pinned · ${pinnedItems.length}/${MAX_PINNED}`}
                title="자주 돌아보는 것"
              />
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-6">
                {pinnedItems.map((item) => (
                  <YoutubeCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    selectMode={selectMode}
                    onSelect={handleSelect}
                    onClick={handleCardClick}
                    onDelete={handleDeleteRequest}
                    onToggleBookmark={handleToggleBookmark}
                    onMemoChange={handleMemoChange}
                    onTogglePin={handleTogglePin}
                    pinLocked={false}
                    savedVariant
                    showMemo
                    sourceTag={getSourceTag(item.sourceId)}
                  />
                ))}
              </div>
            </section>
          )}
          {items.length > 0 && (
            <section>
              {pinnedItems.length > 0 && <SectionHeader eyebrow="All saved" title="전체" />}
              <div
                className={cn(
                  pinnedItems.length > 0 && 'mt-6',
                  'columns-1 sm:columns-2 lg:columns-3 gap-6',
                )}
              >
                {items.map((item) => (
                  <div key={item.id} className="break-inside-avoid mb-6">
                    <YoutubeCard
                      item={item}
                      selected={selectedIds.has(item.id)}
                      selectMode={selectMode}
                      onSelect={handleSelect}
                      onClick={handleCardClick}
                      onDelete={handleDeleteRequest}
                      onToggleBookmark={handleToggleBookmark}
                      onMemoChange={handleMemoChange}
                      onTogglePin={handleTogglePin}
                      pinLocked={pinLocked}
                      savedVariant
                      showMemo
                      sourceTag={getSourceTag(item.sourceId)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : isFeedTab ? (
        // Feed tab Unread/Read: mobile grid + desktop hairline list
        <>
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-10">
            {items.map((item) => (
              <YoutubeCard
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                selectMode={selectMode}
                onSelect={handleSelect}
                onClick={handleCardClick}
                onDelete={handleDeleteRequest}
                onToggleBookmark={handleToggleBookmark}
                onMemoChange={handleMemoChange}
                showMemo={showMemo}
                sourceTag={getSourceTag(item.sourceId)}
              />
            ))}
          </div>
          <div className="hidden lg:block divide-y divide-border/60">
            {items.map((item) => (
              <YoutubeListRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                selectMode={selectMode}
                onSelect={handleSelect}
                onClick={handleCardClick}
                onDelete={handleDeleteRequest}
                onToggleBookmark={handleToggleBookmark}
                onMemoChange={handleMemoChange}
                showMemo={showMemo}
                sourceTag={getSourceTag(item.sourceId)}
              />
            ))}
          </div>
        </>
      ) : (
        // Collect tab: compact list
        <div className="space-y-2">
          {items.map((item) => (
            <YoutubeCompactRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              selectMode={selectMode}
              onSelect={handleSelect}
              onClick={handleCardClick}
              onDelete={handleDeleteRequest}
              sourceTag={getSourceTag(item.sourceId)}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />

      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Single delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>영상을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &lsquo;{deleteTarget?.title}&rsquo; 영상이 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  handleDeleteItem(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 영상을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size}개 영상이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk mark unread confirm */}
      <AlertDialog open={showBulkUnread} onOpenChange={setShowBulkUnread}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>안읽음으로 되돌리시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size}개 영상이 안읽음 상태로 변경됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkMarkUnread}>
              {bulkUnreading ? '처리 중...' : '안읽음으로'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add URL dialog */}
      <AddUrlDialog
        open={showAddUrl}
        onOpenChange={setShowAddUrl}
        onComplete={() => {
          fetchedKeyRef.current = null;
          fetchItems({reset: true});
        }}
      />
    </div>
  );
}
