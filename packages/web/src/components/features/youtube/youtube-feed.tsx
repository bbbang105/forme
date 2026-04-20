'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {BookmarkIcon, Download, Loader2, Mail, MailOpen, MailX, Plus, Search, Star, Trash2, Wand2, X} from 'lucide-react';
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
import {YoutubeCard, type YoutubeItemData} from './youtube-card';
import {YOUTUBE_SUMMARIZE_BATCH_MAX} from '@/lib/constants';
import {AddUrlDialog} from './add-url-dialog';

const EMPTY_TAGS: string[] = [];

type Tab = 'feed' | 'create';
type Status = 'unread' | 'read' | 'bookmarked';
type Period = '3d' | '7d' | '30d';

const MAIN_TABS: { value: Tab; label: string }[] = [
  { value: 'feed', label: '피드' },
  { value: 'create', label: '생성' },
];

const STATUS_CHIPS: { value: Status; label: string; icon: typeof Mail }[] = [
  { value: 'unread', label: '안읽음', icon: Mail },
  { value: 'read', label: '읽음', icon: MailOpen },
  { value: 'bookmarked', label: '북마크', icon: BookmarkIcon },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: '3d', label: '3일' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

const TAG_OPTIONS = [
  { value: 'economy', label: 'ECONOMY' },
  { value: 'dev', label: 'DEV' },
  { value: 'ai', label: 'AI' },
  { value: 'uxui', label: 'UX/UI' },
  { value: 'start-up', label: 'START-UP' },
];

export function YoutubeFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'feed';
  const status = (searchParams.get('status') as Status) || 'unread';
  const activeSourceId = searchParams.get('sourceId') || '';
  const activeTag = searchParams.get('tag') || '';
  const searchQuery = searchParams.get('search') || '';

  // Data state
  const [sources, setSources] = useState<YoutubeSource[]>([]);
  const [items, setItems] = useState<YoutubeItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Collect SSE state
  const [collectPeriod, setCollectPeriod] = useState<Period>('7d');
  const [collectActive, setCollectActive] = useState(false);

  // Selection mode (create tab + feed tab)
  const [selectMode, setSelectMode] = useState(false);

  // Summarize progress
  const [summarizeProgress, setSummarizeProgress] = useState<{
    total: number;
    results: { videoId: string; title: string; status: 'summarizing' | 'summarized' | 'failed'; error?: string }[];
  } | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<YoutubeItemData | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Pinned items — populated on first page of Saved tab
  const [pinnedItems, setPinnedItems] = useState<YoutubeItemData[]>([]);
  const MAX_PINNED = 3;
  const [showAddUrl, setShowAddUrl] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedKeyRef = useRef<string | null>(null);

  const favoriteSources = useMemo(() => sources.filter((s) => s.isFavorite), [sources]);
  const allTags = useMemo(() => [...new Set(sources.flatMap((s) => s.tags ?? []))], [sources]);

  const isCreateTab = tab === 'create';
  const isFeedTab = tab === 'feed';
  const isBookmarkStatus = isFeedTab && status === 'bookmarked';

  // Abort SSE on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Search local state (debounced) — handlers defined after updateFilter
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    return () => clearTimeout(searchTimerRef.current);
  }, []);

  // Build query key for refetch tracking
  const queryKey = `${tab}|${status}|${activeSourceId}|${activeTag}|${searchQuery}`;

  // Fetch sources
  const fetchSources = useCallback(async () => {
    const res = await fetch('/api/youtube/sources');
    if (res.ok) {
      const data: YoutubeSource[] = await res.json();
      setSources(data);
    }
  }, []);

  // Fetch items
  const fetchItems = useCallback(
    async (opts: { reset?: boolean; nextCursor?: string | null } = {}) => {
      const { reset = false, nextCursor = null } = opts;

      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({ tab });
        if (isFeedTab) params.set('status', status);
        if (activeSourceId) params.set('sourceId', activeSourceId);
        if (activeTag) params.set('tag', activeTag);
        if (searchQuery) params.set('search', searchQuery);
        if (!reset && nextCursor) params.set('cursor', nextCursor);

        const res = await fetch(`/api/youtube/items?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        // pinnedItems only returned on first page of Saved tab
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

  // Initial load
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Reload on filter change
  useEffect(() => {
    if (fetchedKeyRef.current === queryKey) return;
    fetchedKeyRef.current = queryKey;
    setItems([]);
    setCursor(null);
    setSelectedIds(new Set());
    setSelectMode(false);
    fetchItems({ reset: true });
  }, [queryKey, fetchItems]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loadingMore && !loading && cursor) {
          fetchItems({ reset: false, nextCursor: cursor });
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, cursor, fetchItems]);

  // URL update helper
  const updateFilter = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && value !== undefined) params.set(key, value);
        else params.delete(key);
      }
      fetchedKeyRef.current = null;
      router.push(`/video?${params.toString()}`);
    },
    [searchParams, router],
  );

  // Stable ref for updateFilter (avoid stale closure in debounce timer)
  const updateFilterRef = useRef(updateFilter);
  useEffect(() => { updateFilterRef.current = updateFilter; }, [updateFilter]);

  // Search handlers
  const handleSearchChange = useCallback((v: string) => {
    setLocalSearch(v);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => updateFilterRef.current({ search: v || null }), 300);
  }, []);

  const handleSearchClear = useCallback(() => {
    setLocalSearch('');
    updateFilter({ search: null });
  }, [updateFilter]);

  // Tab switch handler — reset all sub-filters + cancel pending search debounce
  const handleTabSwitch = useCallback(
    (newTab: Tab) => {
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
    (newStatus: Status) => {
      updateFilter({ status: newStatus });
    },
    [updateFilter],
  );

  // Handlers
  const handleAddSource = async (channelUrl: string) => {
    const res = await fetch('/api/youtube/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl }),
    });
    if (!res.ok) {
      let message = '등록 실패';
      try {
        const data = await res.json();
        message = data.error || message;
      } catch { /* */ }
      throw new Error(message);
    }
    await fetchSources();
  };

  const handleDeleteSource = async (id: string) => {
    const res = await fetch(`/api/youtube/sources/${id}`, { method: 'DELETE' });
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
      fetchItems({ reset: true });
    } else {
      handleTabSwitch('create');
    }
  };

  // Stable refs for items/pinnedItems (avoid stale closure in handlers passed to note'd cards)
  const itemsRef = useRef(items);
  const pinnedItemsRef = useRef(pinnedItems);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { pinnedItemsRef.current = pinnedItems; }, [pinnedItems]);

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Click: summarized → detail page + mark read, others → YouTube + mark read
  const handleCardClick = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;

      if (!item.isRead) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
        );
        fetch(`/api/youtube/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        }).catch(() => {
          setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, isRead: false } : i)),
          );
        });
      }

      if (item.status === 'summarized') {
        router.push(`/video/${id}`);
      } else {
        window.open(`https://www.youtube.com/watch?v=${item.videoId}`, '_blank', 'noopener');
      }
    },
    [router],
  );

  const handleToggleBookmark = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;

    if (!item.isBookmarked) {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? {...i, isBookmarked: true} : i)),
      );
      try {
        const res = await fetch(`/api/youtube/${id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({isBookmarked: true}),
        });
        if (!res.ok) throw new Error();
      } catch {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? {...i, isBookmarked: false} : i)),
        );
      }
      return;
    }

    // Unbookmarking also unpins (server mirrors this invariant)
    const prevPinnedAt = item.pinnedAt;
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
      setItems((prev) =>
        prev.map((i) => (i.id === id ? {...i, isBookmarked: true, pinnedAt: prevPinnedAt} : i)),
      );
    }
  }, []);

  const handleMemoChange = useCallback(async (id: string, note: string | null) => {
    const item =
      itemsRef.current.find((i) => i.id === id) ??
      pinnedItemsRef.current.find((i) => i.id === id);
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
    if (nextPinned && pinnedItemsRef.current.length >= MAX_PINNED &&
        !pinnedItemsRef.current.some((p) => p.id === id)) {
      return;
    }
    const nowIso = new Date().toISOString();

    if (nextPinned) {
      const source = itemsRef.current.find((i) => i.id === id);
      if (source) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setPinnedItems((prev) => [{ ...source, pinnedAt: nowIso, isBookmarked: true }, ...prev]);
      } else {
        setPinnedItems((prev) =>
          prev.map((i) => i.id === id ? { ...i, pinnedAt: nowIso } : i)
        );
      }
    } else {
      const source = pinnedItemsRef.current.find((i) => i.id === id);
      if (source) {
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
        setItems((prev) => [{ ...source, pinnedAt: null }, ...prev]);
      }
    }

    const res = await fetch(`/api/youtube/${id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pinned: nextPinned}),
    });

    if (!res.ok) {
      fetchItems({ reset: true });
    }
  }, [fetchItems]);

  const handleSummarize = async () => {
    if (selectedIds.size === 0) return;
    setSummarizing(true);
    setSummarizeProgress({ total: selectedIds.size, results: [] });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setItems((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, status: 'summarizing' } : item,
      ),
    );

    try {
      const res = await fetch('/api/youtube/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selectedIds) }),
        signal: controller.signal,
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.videoId && data.status) {
                  const uiStatus = data.status === 'failed' ? 'collected' : data.status;
                  setItems((prev) =>
                    prev.map((item) =>
                      item.videoId === data.videoId
                        ? { ...item, status: uiStatus }
                        : item,
                    ),
                  );
                  // Update progress tracker
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
              } catch { /* */ }
            }
          }
        }
      }

      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setSummarizing(false);
    }
  };

  const handleDeleteItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/youtube/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

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
        setSelectedIds(new Set());
        setSelectMode(false);
      }
    } finally {
      setBulkDeleting(false);
      setShowBulkDelete(false);
    }
  };

  const [bulkUnreading, setBulkUnreading] = useState(false);
  const [showBulkUnread, setShowBulkUnread] = useState(false);

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
        setSelectedIds(new Set());
        setSelectMode(false);
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
      null
    );
  }, []);

  // Source tag map for card display
  const sourceTagMap = useMemo(() => new Map(sources.map((s) => [s.id, s.tags ?? []])), [sources]);
  const pinLocked = pinnedItems.length >= MAX_PINNED;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto space-y-4 pb-24">
      {/* ── 1단: 메인 탭 (세그먼트 컨트롤) ── */}
      <div className="flex rounded-xl bg-muted/50 p-1 gap-0.5">
        {MAIN_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTabSwitch(value)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold',
              'transition-all cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              tab === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value === 'feed' && <Mail className="h-4 w-4" aria-hidden="true" />}
            {value === 'create' && <Wand2 className="h-4 w-4" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>

      {/* ── 피드 탭: 검색 ── */}
      {isFeedTab && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="제목이나 요약으로 검색..."
            maxLength={100}
            aria-label="영상 검색"
            className={cn(
              'w-full h-10 pl-9 pr-9 rounded-lg border border-border bg-background',
              'text-base placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              'transition-colors',
            )}
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* ── 2단: 피드 탭 — 상태 필터 칩 + 선택 버튼 ── */}
      {isFeedTab && (
        <div className="relative flex items-center">
          <div className="flex items-center gap-1.5 pr-12">
            {STATUS_CHIPS.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => handleStatusSwitch(chip.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                    'transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    status === chip.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {chip.label}
                </button>
              );
            })}
          </div>
          {!loading && items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((prev) => {
                  if (prev) setSelectedIds(new Set());
                  return !prev;
                });
              }}
              className={cn(
                'absolute right-0 inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                'transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                selectMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {selectMode ? '취소' : '선택'}
            </button>
          )}
        </div>
      )}

      {/* ── 피드 탭: 선택 모드 바 ── */}
      {isFeedTab && selectMode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : '영상을 선택하세요'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size === items.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(items.map((i) => i.id)));
              }}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              {selectedIds.size === items.length ? '선택 해제' : '전체 선택'}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              {status === 'read' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkUnread(true)}
                  disabled={bulkUnreading}
                  className="flex-1 gap-1.5 h-auto py-2.5"
                >
                  <MailX className="h-3.5 w-3.5" aria-hidden="true" />
                  안읽음으로
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkDelete(true)}
                disabled={bulkDeleting}
                className="flex-1 gap-1.5 h-auto py-2.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                삭제
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── 생성 탭: 소스 관리 + 수집 ── */}
      {isCreateTab && (
        <>
          <YoutubeSourceBar
            sources={sources}
            onAdd={handleAddSource}
            onDelete={handleDeleteSource}
            onUpdate={fetchSources}
          />

          {!collectActive && (
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="수집 기간" className="flex rounded-lg border border-border p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={collectPeriod === p.value}
                    onClick={() => setCollectPeriod(p.value)}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                      collectPeriod === p.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleStartCollect}
                disabled={sources.length === 0}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                수집
              </Button>
              {!loading && items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((prev) => {
                      if (prev) setSelectedIds(new Set());
                      return !prev;
                    });
                  }}
                  className={cn(
                    'ml-auto inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                    'transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    selectMode
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {selectMode ? '취소' : '선택'}
                </button>
              )}
            </div>
          )}

          {collectActive && (
            <CollectProgress
              sourceIds={sources.filter((s) => s.isActive).map((s) => s.id)}
              period={collectPeriod}
              onComplete={handleCollectComplete}
              onClose={() => setCollectActive(false)}
            />
          )}
        </>
      )}

      {/* ── 공통: 즐겨찾기 소스 칩 + 태그 칩 ── */}
      {favoriteSources.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-visible scrollbar-none">
          {favoriteSources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() =>
                updateFilter({ sourceId: activeSourceId === source.id ? null : source.id })
              }
              className={cn(
                'inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
                'transition-colors cursor-pointer border',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                activeSourceId === source.id
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Star className="h-3 w-3 text-amber-500" fill="currentColor" aria-hidden="true" />
              <span className="max-w-[100px] truncate">{source.channelName}</span>
            </button>
          ))}
        </div>
      )}

      {(allTags.length > 0 || isFeedTab || (isCreateTab && !loading && items.length > 0)) && (
        <div className="relative flex items-center">
          <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-visible scrollbar-none pr-10">
            {TAG_OPTIONS.filter((t) => allTags.includes(t.value)).map((tagOpt) => (
              <button
                key={tagOpt.value}
                type="button"
                onClick={() =>
                  updateFilter({ tag: activeTag === tagOpt.value ? null : tagOpt.value })
                }
                className={cn(
                  'inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  'transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  activeTag === tagOpt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground ring-1 ring-border/50',
                )}
              >
                {tagOpt.label}
              </button>
            ))}
          </div>

          {/* URL 직접 추가 버튼 — 항상 우측 고정 */}
          {isFeedTab && (
            <button
              type="button"
              onClick={() => setShowAddUrl(true)}
              className={cn(
                'absolute right-0 inline-flex items-center justify-center',
                'h-7 w-7 rounded-full bg-primary text-primary-foreground',
                'shadow-sm hover:bg-primary/90 transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              )}
              aria-label="YouTube URL 직접 추가"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* ── 생성 탭: 선택 모드 바 ── */}
      {isCreateTab && selectMode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : '요약할 영상을 선택하세요'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size === items.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(items.map((i) => i.id)));
              }}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              {selectedIds.size === items.length ? '선택 해제' : '전체 선택'}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSummarize}
                disabled={summarizing || selectedIds.size > YOUTUBE_SUMMARIZE_BATCH_MAX}
                className={cn(
                  'flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground',
                  'transition-colors hover:bg-primary/90',
                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {summarizing ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    요약 중…
                  </span>
                ) : selectedIds.size > YOUTUBE_SUMMARIZE_BATCH_MAX ? (
                  `최대 ${YOUTUBE_SUMMARIZE_BATCH_MAX}개까지 요약 가능`
                ) : (
                  `선택한 ${selectedIds.size}개 요약하기`
                )}
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkDelete(true)}
                disabled={bulkDeleting}
                className="gap-1 shrink-0 h-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                삭제
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── 요약 진행 상황 ── */}
      {summarizeProgress && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3" role="status" aria-live="polite">
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
                  fetchItems({ reset: true });
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                닫기
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(summarizeProgress.results.length / summarizeProgress.total) * 100}%` }}
            />
          </div>

          {/* Individual results */}
          <div className="space-y-1.5">
            {summarizeProgress.results.map((r) => (
              <div key={r.videoId} className="flex items-start gap-2 text-xs">
                {r.status === 'summarized' ? (
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                ) : (
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-destructive/20 text-destructive flex items-center justify-center text-[10px]">✕</span>
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

      {/* ── Feed ── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : items.length === 0 && pinnedItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">
            {isFeedTab && status === 'unread' && '안읽은 요약이 없어요'}
            {isFeedTab && status === 'read' && '읽은 요약이 없어요'}
            {isFeedTab && status === 'bookmarked' && '북마크한 영상이 없어요'}
            {isCreateTab && '수집된 영상이 없어요'}
          </p>
          <p className="text-xs">
            {isFeedTab && status === 'unread' && '생성 탭에서 영상을 수집하고 요약해보세요'}
            {isFeedTab && status === 'read' && '안읽음 탭에서 요약을 읽으면 여기에 표시돼요'}
            {isFeedTab && status === 'bookmarked' && '마음에 드는 영상을 북마크해보세요'}
            {isCreateTab && '채널을 추가하고 영상을 수집해보세요'}
          </p>
        </div>
      ) : isBookmarkStatus ? (
        <>
          {pinnedItems.length > 0 && (
            <section className="mb-10">
              <SectionHeader
                eyebrow={`Pinned · ${pinnedItems.length}/${MAX_PINNED}`}
                title="자주 돌아보는 것"
              />
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedItems.map((item) => (
                  <YoutubeCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    onSelect={selectMode ? handleSelect : undefined}
                    onClick={selectMode ? undefined : handleCardClick}
                    onDelete={handleDeleteRequest}
                    onToggleBookmark={handleToggleBookmark}
                    onMemoChange={handleMemoChange}
                    onTogglePin={handleTogglePin}
                    pinLocked={false}
                    savedVariant
                    showMemo
                    sourceTags={item.sourceId ? sourceTagMap.get(item.sourceId) ?? EMPTY_TAGS : EMPTY_TAGS}
                  />
                ))}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <section>
              {pinnedItems.length > 0 && (
                <SectionHeader eyebrow="All saved" title="전체" />
              )}
              <div className={`${pinnedItems.length > 0 ? 'mt-5' : ''} columns-1 sm:columns-2 lg:columns-3 gap-4`}>
                {items.map((item) => (
                  <div key={item.id} className="break-inside-avoid mb-4">
                    <YoutubeCard
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onSelect={selectMode ? handleSelect : undefined}
                      onClick={selectMode ? undefined : handleCardClick}
                      onDelete={handleDeleteRequest}
                      onToggleBookmark={handleToggleBookmark}
                      onMemoChange={handleMemoChange}
                      onTogglePin={handleTogglePin}
                      pinLocked={pinLocked}
                      savedVariant
                      showMemo
                      sourceTags={item.sourceId ? sourceTagMap.get(item.sourceId) ?? EMPTY_TAGS : EMPTY_TAGS}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <YoutubeCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={selectMode ? handleSelect : undefined}
              onClick={selectMode ? undefined : handleCardClick}
              onDelete={handleDeleteRequest}
              onToggleBookmark={isFeedTab ? handleToggleBookmark : undefined}
              onMemoChange={isFeedTab ? handleMemoChange : undefined}
              showMemo={isFeedTab}
              sourceTags={item.sourceId ? sourceTagMap.get(item.sourceId) ?? EMPTY_TAGS : EMPTY_TAGS}
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

      {/* Single delete confirmation */}
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

      {/* Bulk delete confirmation */}
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

      {/* Bulk mark unread confirmation */}
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
