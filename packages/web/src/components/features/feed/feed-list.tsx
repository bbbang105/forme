'use client';

import {useCallback, useEffect, useRef, useState, useMemo} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {CheckSquare, Loader2, MailX, Newspaper, Plus, Trash2, X} from 'lucide-react';
import {Skeleton} from '@/components/ui/skeleton';
import {Button} from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {SectionHeader} from '@/components/ui/section-header';
import {FeedCard, type FeedItemData, FeedListRow} from './feed-card';
import {type StatusFilter} from './feed-filters';
import {FeedFilterBar, type SortMode} from './feed-filter-bar';
import dynamic from 'next/dynamic';

const SourceManager = dynamic(
  () => import('./source-manager').then((m) => m.SourceManager),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse bg-muted rounded-md h-9 w-24" />
    ),
  }
);

const AddUrlDialog = dynamic(
  () => import('./add-url-dialog').then((m) => m.AddUrlDialog),
  { ssr: false }
);

const PAGE_SIZE = 12;
const MAX_PINNED = 3;

/** Shared helper — builds the query string for /api/feed and fetchItems */
function buildFeedParams(opts: {
  category: string;
  status: StatusFilter;
  search: string;
  tagsParam: string;
  sort: SortMode;
  sourceId: string;
  cursor?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  if (opts.tagsParam) params.set('tags', opts.tagsParam);
  if (opts.sort !== 'latest') params.set('sort', opts.sort);
  if (opts.sourceId) params.set('sourceId', opts.sourceId);
  if (opts.cursor) params.set('cursor', opts.cursor);
  return params;
}

export function FeedList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state from URL
  const category = searchParams.get('category') ?? '';
  const status = (searchParams.get('status') ?? 'unread') as StatusFilter;
  const search = searchParams.get('search') ?? '';
  const tagsParam = searchParams.get('tags') ?? '';
  const selectedTags = useMemo(
    () => (tagsParam ? tagsParam.split(',').filter(Boolean) : []),
    [tagsParam]
  );
  const sort = (searchParams.get('sort') ?? 'latest') as SortMode;
  const sourceId = searchParams.get('sourceId') ?? '';

  // Data state
  const [items, setItems] = useState<FeedItemData[]>([]);
  const [pinnedItems, setPinnedItems] = useState<FeedItemData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasSources, setHasSources] = useState(true);
  const [favoriteSources, setFavoriteSources] = useState<{ id: string; name: string }[]>([]);
  const [manualSourceId, setManualSourceId] = useState<string | null>(null);
  const [addUrlOpen, setAddUrlOpen] = useState(false);

  // Selection & delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkUnreadOpen, setBulkUnreadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkUnreading, setBulkUnreading] = useState(false);

  const isSavedTab = status === 'bookmarked';
  const showMemo = status === 'bookmarked' || status === 'read';
  const pinLocked = pinnedItems.length >= MAX_PINNED;

  // Refs for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(cursor);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);

  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // Exit select mode on filter change
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [category, status, search, tagsParam, sort, sourceId]);

  // URL sync helper
  const updateFilters = useCallback(
    (updates: {
      category?: string;
      status?: StatusFilter;
      search?: string;
      tags?: string[];
      sort?: SortMode;
      sourceId?: string;
    }) => {
      const newCategory = updates.category ?? category;
      const newStatus = updates.status ?? status;
      const newSearch = updates.search ?? search;
      const newTags = updates.tags ?? selectedTags;
      const newSort = updates.sort ?? sort;
      const newSourceId = updates.sourceId ?? sourceId;

      const params = buildFeedParams({
        category: newCategory,
        status: newStatus,
        search: newSearch,
        tagsParam: newTags.join(','),
        sort: newSort,
        sourceId: newSourceId,
      });
      if (newStatus === 'unread') params.delete('status');

      const qs = params.toString();
      router.push(`/feed${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, category, status, search, selectedTags, sort, sourceId]
  );

  // Fetch items
  const fetchItems = useCallback(
    async (cursorArg: string | null, append: boolean) => {
      if (!append) setLoading(true);

      const params = buildFeedParams({ category, status, search, tagsParam, sort, sourceId, cursor: cursorArg });
      params.set('limit', String(PAGE_SIZE));

      try {
        const res = await fetch(`/api/feed?${params}`);
        if (!res.ok) return;

        const data = await res.json();

        if (append) {
          setItems((prev) => [...prev, ...(data.items ?? [])]);
        } else {
          setItems(data.items ?? []);
          // pinnedItems only populated on first page of the Saved tab; reset otherwise.
          setPinnedItems(data.pinnedItems ?? []);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } finally {
        if (!append) setLoading(false);
      }
    },
    [category, status, search, tagsParam, sort, sourceId]
  );

  // Fetch sources for categories + favorites
  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/feed/sources');
    if (!res.ok) return;
    const sources: { id: string; name: string; url: string; category: string; isFavorite: boolean }[] = await res.json();
    setHasSources(sources.length > 0);
    const cats = [...new Set(sources.map((s) => s.category))] as string[];
    setCategories(cats);
    setFavoriteSources(
      sources.filter((s) => s.isFavorite).map((s) => ({ id: s.id, name: s.name }))
    );
    const manual = sources.find((s) => s.url === 'manual://');
    setManualSourceId(manual?.id ?? null);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // Fetch items on filter changes
  useEffect(() => {
    fetchItems(null, false);
  }, [category, status, search, tagsParam, sort, sourceId, fetchItems]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          setLoadingMore(true);
          fetchItems(cursorRef.current, true).finally(() => {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          });
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchItems, loading]);

  // ── Optimistic handlers ──

  const handleToggleBookmark = useCallback(async (id: string, isBookmarked: boolean) => {
    // Unbookmarking a pinned item auto-unpins it (server mirrors this invariant).
    setPinnedItems((prev) =>
      isBookmarked ? prev : prev.filter((item) => item.id !== id)
    );
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {...item, isBookmarked, ...(isBookmarked ? {} : {pinnedAt: null})}
          : item
      )
    );

    const res = await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isBookmarked }),
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
  }, [fetchItems]);

  const handleMarkRead = useCallback(async (id: string) => {
    if (status === 'unread') {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) =>
        prev.map((item) => item.id === id ? { ...item, isRead: true } : item)
      );
    }

    const res = await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });

    if (!res.ok) fetchItems(null, false);
  }, [status, fetchItems]);

  const handleMemoChange = useCallback(async (id: string, note: string | null) => {
    const previousItem =
      itemsRef.current.find((i) => i.id === id) ??
      pinnedItemsRef.current.find((i) => i.id === id);
    const prevMemo = previousItem?.note ?? null;
    const wasBookmarked = previousItem?.isBookmarked ?? false;

    const apply = (list: FeedItemData[]) =>
      list.map((i) =>
        i.id === id
          ? { ...i, note, isBookmarked: note ? true : i.isBookmarked }
          : i
      );
    setItems(apply);
    setPinnedItems(apply);

    try {
      const res = await fetch(`/api/feed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error();
    } catch {
      const revert = (list: FeedItemData[]) =>
        list.map((i) => i.id === id ? { ...i, note: prevMemo, isBookmarked: wasBookmarked } : i);
      setItems(revert);
      setPinnedItems(revert);
    }
  }, []);

  const handleTogglePin = useCallback(async (id: string, nextPinned: boolean) => {
    // Block pinning when already at cap (cover the race between UI and server).
    if (nextPinned && pinnedItemsRef.current.length >= MAX_PINNED &&
        !pinnedItemsRef.current.some((p) => p.id === id)) {
      return;
    }

    const nowIso = new Date().toISOString();

    if (nextPinned) {
      // Optimistic: find item in regular list, move to pinned
      const source = itemsRef.current.find((i) => i.id === id);
      if (source) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setPinnedItems((prev) => [{ ...source, pinnedAt: nowIso, isBookmarked: true }, ...prev]);
      } else {
        // Already in pinned list (idempotent) — just bump pinnedAt
        setPinnedItems((prev) =>
          prev.map((i) => i.id === id ? { ...i, pinnedAt: nowIso } : i)
        );
      }
    } else {
      // Optimistic: move from pinned back to regular list at top
      const source = pinnedItemsRef.current.find((i) => i.id === id);
      if (source) {
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
        setItems((prev) => [{ ...source, pinnedAt: null }, ...prev]);
      }
    }

    const res = await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: nextPinned }),
    });

    if (!res.ok) {
      // Re-sync from server on failure (e.g., server rejected due to limit race).
      fetchItems(null, false);
    }
  }, [fetchItems]);

  // ── Delete handlers ──

  const handleDeleteRequest = useCallback((id: string) => {
    const item = items.find((i) => i.id === id) ?? pinnedItems.find((i) => i.id === id);
    setDeleteTarget(item ? { id: item.id, title: item.title } : null);
  }, [items, pinnedItems]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    setPinnedItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));

    const res = await fetch(`/api/feed/${deleteTarget.id}`, { method: 'DELETE' });

    if (!res.ok) fetchItems(null, false);
    setDeleteTarget(null);
    setDeleting(false);
  }, [deleteTarget, fetchItems]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);

    const ids = [...selectedIds];
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setPinnedItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));

    let failed = false;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const res = await fetch('/api/feed/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      });
      if (!res.ok) failed = true;
    }

    if (failed) fetchItems(null, false);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkDeleteOpen(false);
    setDeleting(false);
  }, [selectedIds, fetchItems]);

  const handleBulkMarkUnread = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkUnreading(true);

    const ids = [...selectedIds];
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));

    let failed = false;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const res = await fetch('/api/feed/bulk-action', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ids: chunk, action: 'mark_unread'}),
      });
      if (!res.ok) failed = true;
    }

    if (failed) fetchItems(null, false);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkUnreadOpen(false);
    setBulkUnreading(false);
  }, [selectedIds, fetchItems]);

  // ── Selection helpers ──

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const all = itemsRef.current;
      if (prev.size === all.length) return new Set();
      return new Set(all.map((i) => i.id));
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // ── Keyboard navigation (DOM-based focus to avoid re-renders) ──

  const focusIndexRef = useRef(-1);
  const itemsRef = useRef(items);
  const pinnedItemsRef = useRef(pinnedItems);
  const handleMarkReadRef = useRef(handleMarkRead);
  const handleToggleBookmarkRef = useRef(handleToggleBookmark);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { pinnedItemsRef.current = pinnedItems; }, [pinnedItems]);
  useEffect(() => { handleMarkReadRef.current = handleMarkRead; }, [handleMarkRead]);
  useEffect(() => { handleToggleBookmarkRef.current = handleToggleBookmark; }, [handleToggleBookmark]);

  // Reset focus on filter/data change
  useEffect(() => {
    const feed = document.querySelector('[data-feed-feed]');
    const prev = feed?.querySelector('[data-feed-focused]');
    if (prev) {
      prev.removeAttribute('data-feed-focused');
      prev.classList.remove('ring-2', 'ring-primary/50', 'rounded-xl');
    }
    focusIndexRef.current = -1;
  }, [category, status, search, tagsParam, sort, sourceId]);

  useEffect(() => {
    if (selectMode || loading) return;

    function applyFocusRing(index: number) {
      const feed = document.querySelector('[data-feed-feed]');
      if (!feed) return;
      const prev = feed.querySelector('[data-feed-focused]');
      if (prev) {
        prev.removeAttribute('data-feed-focused');
        prev.classList.remove('ring-2', 'ring-primary/50', 'rounded-xl');
      }
      const el = feed.querySelector(`[data-feed-index="${index}"]`);
      if (el) {
        el.setAttribute('data-feed-focused', '');
        el.classList.add('ring-2', 'ring-primary/50', 'rounded-xl');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el?.isContentEditable || el?.closest('[role="dialog"]')) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      const idx = focusIndexRef.current;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(idx + 1, currentItems.length - 1);
        focusIndexRef.current = next;
        applyFocusRing(next);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(idx - 1, 0);
        focusIndexRef.current = prev;
        applyFocusRing(prev);
      } else if (e.key === 'o' || e.key === 'Enter') {
        if (idx >= 0 && idx < currentItems.length) {
          if (!currentItems[idx].isRead) handleMarkReadRef.current(currentItems[idx].id);
          window.open(currentItems[idx].url, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'b') {
        if (idx >= 0 && idx < currentItems.length) {
          handleToggleBookmarkRef.current(currentItems[idx].id, !currentItems[idx].isBookmarked);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectMode, loading]);

  const handleCrawlComplete = useCallback(() => {
    fetchCategories();
    fetchItems(null, false);
  }, [fetchItems, fetchCategories]);

  const handleFavoritesChange = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ── Empty state: no sources ──
  if (!loading && !hasSources) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-end mb-8">
          <SourceManager onCrawlComplete={handleCrawlComplete} onFavoritesChange={handleFavoritesChange} />
        </div>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md mx-auto">
          <Newspaper className="h-6 w-6 text-primary mb-6" aria-hidden="true" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
            <span className="text-primary" aria-hidden="true">—</span> Getting started
          </p>
          <h3 className="font-display text-3xl leading-tight text-foreground mb-4">
            Let&apos;s begin with a source.
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            RSS 피드 소스를 등록하면 자동으로 글을 수집합니다.
            우측 상단 <span className="font-mono text-foreground">Source</span> 버튼에서 시작하세요.
          </p>
        </div>
      </div>
    );
  }

  const isEmpty = items.length === 0 && pinnedItems.length === 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {/* Select mode action bar — editorial hairline style */}
      {selectMode && (
        <div className="flex items-center justify-between gap-3 mb-6 pb-3 border-b border-border">
          <div className="flex items-baseline gap-4">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              {selectedIds.size === items.length ? 'Clear all' : 'Select all'}
            </button>
            <span
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-primary" aria-hidden="true">—</span> {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {status === 'read' && (
              <Button
                variant="outline"
                size="sm"
                disabled={selectedIds.size === 0 || bulkUnreading}
                onClick={() => setBulkUnreadOpen(true)}
              >
                {bulkUnreading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                ) : (
                  <MailX className="h-4 w-4 mr-1.5" aria-hidden="true" />
                )}
                {bulkUnreading ? '이동 중...' : '안읽음으로'}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || deleting}
              onClick={() => setBulkDeleteOpen(true)}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              )}
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <FeedFilterBar
        search={search}
        onSearchChange={(v) => updateFilters({ search: v })}
        categories={categories}
        selectedCategory={category}
        onCategoryChange={(c) => updateFilters({ category: c })}
        status={status}
        onStatusChange={(s) => updateFilters({ status: s })}
        selectedTags={selectedTags}
        onTagsChange={(tags) => updateFilters({ tags })}
        sort={sort}
        onSortChange={(s) => updateFilters({ sort: s })}
        sourceId={sourceId}
        onSourceIdChange={(id) => updateFilters({ sourceId: id })}
        favoriteSources={favoriteSources}
        manualSourceId={manualSourceId}
        statusActions={
          <>
            {!selectMode ? (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                disabled={loading || items.length === 0}
                className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
                aria-label="선택 모드"
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={exitSelectMode}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="선택 취소"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setAddUrlOpen(true)}
              className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="URL 직접 추가"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <SourceManager onCrawlComplete={handleCrawlComplete} onFavoritesChange={handleFavoritesChange} />
          </>
        }
      />

      {/* Feed */}
      <div className="min-h-[30vh]" data-feed-feed>
      {loading ? (
        <FeedSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center max-w-sm mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
            <span className="text-primary" aria-hidden="true">—</span> Nothing here
          </p>
          <p className="font-display text-2xl leading-snug text-foreground">
            {search
              ? `"${search.slice(0, 100)}" 검색 결과가 없습니다.`
              : selectedTags.length > 0
                ? '선택한 태그에 맞는 글이 없습니다.'
                : status === 'unread'
                  ? '안읽은 글이 없어요. 모두 읽었어요.'
                  : status === 'read'
                    ? '읽은 글이 없어요.'
                    : status === 'bookmarked'
                      ? '북마크한 글이 없습니다.'
                      : '수집된 글이 없습니다.'}
          </p>
        </div>
      ) : isSavedTab ? (
        // ── Saved view: pinned grid + masonry for the rest ──
        <>
          {pinnedItems.length > 0 && (
            <section className="mb-12">
              <SectionHeader
                eyebrow={`Pinned · ${pinnedItems.length}/${MAX_PINNED}`}
                title="자주 돌아보는 것"
              />
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-6">
                {pinnedItems.map((item) => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onToggleBookmark={handleToggleBookmark}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDeleteRequest}
                    onMemoChange={handleMemoChange}
                    onTogglePin={handleTogglePin}
                    pinLocked={false}
                    showMemo
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={toggleSelect}
                    savedVariant
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
              <div className={`${pinnedItems.length > 0 ? 'mt-6' : ''} columns-1 sm:columns-2 lg:columns-3 gap-6`}>
                {items.map((item, i) => (
                  <div key={item.id} data-feed-index={i} className="break-inside-avoid mb-6">
                    <FeedCard
                      item={item}
                      onToggleBookmark={handleToggleBookmark}
                      onMarkRead={handleMarkRead}
                      onDelete={handleDeleteRequest}
                      onMemoChange={handleMemoChange}
                      onTogglePin={handleTogglePin}
                      pinLocked={pinLocked}
                      showMemo
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={toggleSelect}
                      savedVariant
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div ref={sentinelRef} className="h-px" />
          {loadingMore && (
            <div className="py-6">
              <LoadMoreSkeleton />
            </div>
          )}
        </>
      ) : (
        // ── Default view (Unread / Read): grid (mobile) + list (desktop) ──
        <>
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-10">
            {items.map((item, i) => (
              <div key={item.id} data-feed-index={i}>
                <FeedCard
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  showMemo={showMemo}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                  compact={false}
                />
              </div>
            ))}
          </div>

          <div className="hidden lg:block divide-y divide-border/60">
            {items.map((item, i) => (
              <div key={item.id} data-feed-index={i}>
                <FeedListRow
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  showMemo={showMemo}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                />
              </div>
            ))}
          </div>

          <div ref={sentinelRef} className="h-px" />
          {loadingMore && (
            <div className="py-6">
              <LoadMoreSkeleton />
            </div>
          )}
        </>
      )}
      </div>

      {/* Single delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>글을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title}&quot; 글이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteConfirm}
            >
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />삭제 중...</> : '삭제'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size}개 글을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.size}개의 글이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleBulkDeleteConfirm}
            >
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />삭제 중...</> : `${selectedIds.size}개 삭제`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk mark unread confirm */}
      <AlertDialog open={bulkUnreadOpen} onOpenChange={(open) => !open && setBulkUnreadOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>안읽음으로 되돌리기</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.size}개의 글을 안읽음 상태로 이동합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUnreading}>취소</AlertDialogCancel>
            <Button
              disabled={bulkUnreading}
              onClick={handleBulkMarkUnread}
            >
              {bulkUnreading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />이동 중...</> : '안읽음으로'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add URL dialog */}
      <AddUrlDialog
        open={addUrlOpen}
        onOpenChange={setAddUrlOpen}
        onComplete={() => { fetchItems(null, false); fetchCategories(); }}
      />
    </div>
  );
}

function FeedSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-x-6 gap-y-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[16/10] w-full rounded-sm" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </div>
      <div className="hidden lg:block divide-y divide-border/60">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-5 py-5">
            <Skeleton className="w-[140px] h-[90px] rounded-sm shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function LoadMoreSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-x-6 gap-y-10">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[16/10] w-full rounded-sm" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
      <div className="hidden lg:block divide-y divide-border/60">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-5 py-5">
            <Skeleton className="w-[140px] h-[90px] rounded-sm shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
