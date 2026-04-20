'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {CheckSquare, Loader2, MailX, Newspaper, Plus, Settings2, Trash2, X} from 'lucide-react';
import {cn} from '@/lib/utils';
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
import {type CollectionInfo, FeedCard, type FeedItemData, FeedListRow} from './feed-card';
import {type StatusFilter} from './feed-filters';
import {FeedFilterBar, type SortMode} from './feed-filter-bar';
import {CollectionPicker} from './collection-picker';
import type {BookmarkCollection} from './collection-manager';
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

const CollectionManager = dynamic(
  () => import('./collection-manager').then((m) => m.CollectionManager),
  { ssr: false }
);

const AddUrlDialog = dynamic(
  () => import('./add-url-dialog').then((m) => m.AddUrlDialog),
  { ssr: false }
);

const PAGE_SIZE = 12;

/** Shared helper — builds the query string for /api/feed and fetchItems */
function buildFeedParams(opts: {
  category: string;
  status: StatusFilter;
  search: string;
  tagsParam: string;
  sort: SortMode;
  sourceId: string;
  collectionId?: string;
  cursor?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  if (opts.tagsParam) params.set('tags', opts.tagsParam);
  if (opts.sort !== 'latest') params.set('sort', opts.sort);
  if (opts.sourceId) params.set('sourceId', opts.sourceId);
  if (opts.collectionId) params.set('collectionId', opts.collectionId);
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
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasSources, setHasSources] = useState(true);
  const [favoriteSources, setFavoriteSources] = useState<{ id: string; name: string }[]>([]);
  const [manualSourceId, setManualSourceId] = useState<string | null>(null);

  // Collection state
  const [collections, setCollections] = useState<BookmarkCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [collectionPickerTarget, setCollectionPickerTarget] = useState<string | null>(null);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [addUrlOpen, setAddUrlOpen] = useState(false);

  const collectionMap = useMemo(() => {
    const map = new Map<string, CollectionInfo>();
    for (const c of collections) {
      map.set(c.id, { id: c.id, name: c.name, color: c.color });
    }
    return map;
  }, [collections]);

  // Selection & delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkUnreadOpen, setBulkUnreadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkUnreading, setBulkUnreading] = useState(false);

  // Refs for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(cursor);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Exit select mode on filter change
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [category, status, search, tagsParam, sort, sourceId, selectedCollectionId]);

  // URL sync helper
  const updateFilters = useCallback(
    (updates: {
      category?: string;
      status?: StatusFilter;
      search?: string;
      tags?: string[];
      sort?: SortMode;
      sourceId?: string;
      collectionId?: string;
    }) => {
      const newCategory = updates.category ?? category;
      const newStatus = updates.status ?? status;
      const newSearch = updates.search ?? search;
      const newTags = updates.tags ?? selectedTags;
      const newSort = updates.sort ?? sort;
      const newSourceId = updates.sourceId ?? sourceId;
      const newCollectionId = updates.collectionId ?? selectedCollectionId;

      const params = buildFeedParams({
        category: newCategory,
        status: newStatus,
        search: newSearch,
        tagsParam: newTags.join(','),
        sort: newSort,
        sourceId: newSourceId,
        collectionId: newCollectionId,
      });
      // status 'unread' is the default, don't include in URL
      if (newStatus === 'unread') params.delete('status');

      const qs = params.toString();
      router.push(`/feed${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, category, status, search, selectedTags, sort, sourceId, selectedCollectionId]
  );

  // Fetch items
  const fetchItems = useCallback(
    async (cursorArg: string | null, append: boolean) => {
      if (!append) setLoading(true);

      const params = buildFeedParams({ category, status, search, tagsParam, sort, sourceId, collectionId: selectedCollectionId, cursor: cursorArg });
      params.set('limit', String(PAGE_SIZE));

      try {
        const res = await fetch(`/api/feed?${params}`);
        if (!res.ok) return;

        const data = await res.json();

        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } finally {
        if (!append) setLoading(false);
      }
    },
    [category, status, search, tagsParam, sort, sourceId, selectedCollectionId]
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

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    try {
      const { getCollectionsWithCount } = await import('@/lib/actions/collections');
      const data = await getCollectionsWithCount();
      setCollections(data);
    } catch {
      // ignore
    }
  }, []);

  // Load categories + collections on mount
  useEffect(() => {
    fetchCategories();
    fetchCollections();
  }, [fetchCategories, fetchCollections]);

  // Fetch items on filter changes
  useEffect(() => {
    fetchItems(null, false);
  }, [category, status, search, tagsParam, sort, sourceId, selectedCollectionId, fetchItems]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasMoreRef.current &&
          !loadingMoreRef.current
        ) {
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

  // Optimistic updates
  const handleToggleBookmark = useCallback(
    async (id: string, isBookmarked: boolean) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isBookmarked } : item
        )
      );

      const res = await fetch(`/api/feed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBookmarked }),
      });

      if (!res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, isBookmarked: !isBookmarked } : item
          )
        );
      }
    },
    []
  );

  const handleMarkRead = useCallback(async (id: string) => {
    if (status === 'unread') {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isRead: true } : item
        )
      );
    }

    const res = await fetch(`/api/feed/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
  }, [status, fetchItems]);

  // ── Memo handler ──

  const handleMemoChange = useCallback(async (id: string, memo: string | null) => {
    const item = itemsRef.current.find((i) => i.id === id);
    const prevMemo = item?.memo ?? null;
    const wasBookmarked = item?.isBookmarked ?? false;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, memo, isBookmarked: memo ? true : i.isBookmarked }
          : i
      )
    );

    try {
      const res = await fetch(`/api/feed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, memo: prevMemo, isBookmarked: wasBookmarked } : i
        )
      );
      return;
    }

    // 메모 추가 + 기존에 북마크 아니었으면 → 컬렉션 피커 자동 오픈
    if (memo && !wasBookmarked) {
      setCollectionPickerTarget(id);
    }
  }, []);

  const isBookmarkTab = status === 'bookmarked';
  const showMemo = status === 'bookmarked' || status === 'read';

  // ── Collection handlers ──

  const handleCollectionPick = useCallback((itemId: string) => {
    setCollectionPickerTarget(itemId);
  }, []);

  const handleCollectionSelect = useCallback(async (collectionId: string | null) => {
    if (!collectionPickerTarget) return;
    const itemId = collectionPickerTarget;

    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, collectionId, ...(collectionId !== null ? { isBookmarked: true } : {}) }
          : item
      )
    );

    const res = await fetch(`/api/feed/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId }),
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
    // Refresh collection counts
    fetchCollections();
  }, [collectionPickerTarget, fetchItems, fetchCollections]);

  // ── Delete handlers ──

  const handleDeleteRequest = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    setDeleteTarget(item ? { id: item.id, title: item.title } : null);
  }, [items]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));

    const res = await fetch(`/api/feed/${deleteTarget.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
    setDeleteTarget(null);
    setDeleting(false);
  }, [deleteTarget, fetchItems]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);

    const ids = [...selectedIds];
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));

    // chunk into batches of 100
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

    if (failed) {
      fetchItems(null, false);
    }
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

    if (failed) {
      fetchItems(null, false);
    }
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
  // Keep latest items/handlers in refs so the keydown listener never goes stale
  const itemsRef = useRef(items);
  const handleMarkReadRef = useRef(handleMarkRead);
  const handleToggleBookmarkRef = useRef(handleToggleBookmark);

  useEffect(() => { itemsRef.current = items; }, [items]);
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
  }, [category, status, search, tagsParam, sort, sourceId, selectedCollectionId]);

  useEffect(() => {
    if (selectMode || loading) return;

    function applyFocusRing(index: number) {
      const feed = document.querySelector('[data-feed-feed]');
      if (!feed) return;
      // Remove old
      const prev = feed.querySelector('[data-feed-focused]');
      if (prev) {
        prev.removeAttribute('data-feed-focused');
        prev.classList.remove('ring-2', 'ring-primary/50', 'rounded-xl');
      }
      // Apply new
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
  // Only re-register when selectMode or loading changes — items changes are handled via refs
  }, [selectMode, loading]);

  const handleCrawlComplete = useCallback(() => {
    fetchCategories();
    fetchItems(null, false);
  }, [fetchItems, fetchCategories]);

  const handleFavoritesChange = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Empty state: no sources
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
        onStatusChange={(s) => {
          if (s !== 'bookmarked') {
            setSelectedCollectionId('');
            updateFilters({ status: s, collectionId: '' });
          } else {
            updateFilters({ status: s });
          }
        }}
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

      {/* Collection chips (bookmark tab only) */}
      {isBookmarkTab && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide pb-0.5">
          {collections.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setSelectedCollectionId('')}
                className={cn(
                  'shrink-0 px-2.5 py-1.5 rounded-sm text-xs border transition-colors cursor-pointer',
                  selectedCollectionId === ''
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
                )}
              >
                All
              </button>
              {collections.map((col) => (
                <button
                  type="button"
                  key={col.id}
                  onClick={() =>
                    setSelectedCollectionId(col.id === selectedCollectionId ? '' : col.id)
                  }
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs border transition-colors cursor-pointer',
                    selectedCollectionId === col.id
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{backgroundColor: col.color}}
                    aria-hidden="true"
                  />
                  {col.name}
                  {col.count !== undefined && col.count > 0 && (
                    <span className="font-mono text-[10px] opacity-70">{col.count}</span>
                  )}
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            onClick={() => setCollectionManagerOpen(true)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 rounded-sm text-xs transition-colors cursor-pointer',
              collections.length === 0
                ? 'px-2.5 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                : 'p-1.5 text-muted-foreground/60 hover:text-foreground',
            )}
            aria-label="컬렉션 관리"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            {collections.length === 0 && <span>New collection</span>}
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="min-h-[30vh]" data-feed-feed>
      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
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
      ) : (
        <>
          {/* Card grid (mobile/tablet) */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((item, i) => (
              <div
                key={item.id}
                data-feed-index={i}
                className=""
              >
                <FeedCard
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  onCollectionPick={(isBookmarkTab || status === 'read') ? handleCollectionPick : undefined}
                  collectionMap={(isBookmarkTab || status === 'read') ? collectionMap : undefined}
                  showMemo={showMemo}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                  compact={false}
                />
              </div>
            ))}
          </div>

          {/* List view (desktop) */}
          <div className="hidden lg:block divide-y divide-border/60">
            {items.map((item, i) => (
              <div
                key={item.id}
                data-feed-index={i}
                className=""
              >
                <FeedListRow
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  onCollectionPick={(isBookmarkTab || status === 'read') ? handleCollectionPick : undefined}
                  collectionMap={(isBookmarkTab || status === 'read') ? collectionMap : undefined}
                  showMemo={showMemo}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                />
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {/* Loading more indicator */}
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

      {/* Collection picker bottom sheet */}
      <CollectionPicker
        open={!!collectionPickerTarget}
        onOpenChange={(open) => { if (!open) setCollectionPickerTarget(null); }}
        collections={collections}
        currentCollectionId={
          collectionPickerTarget
            ? items.find((i) => i.id === collectionPickerTarget)?.collectionId ?? null
            : null
        }
        onSelect={handleCollectionSelect}
      />

      {/* Add URL dialog */}
      <AddUrlDialog
        open={addUrlOpen}
        onOpenChange={setAddUrlOpen}
        onComplete={() => { fetchItems(null, false); fetchCategories(); }}
      />

      {/* Collection manager dialog */}
      {collectionManagerOpen && (
        <CollectionManager
          open={collectionManagerOpen}
          onOpenChange={setCollectionManagerOpen}
          collections={collections}
          onCollectionsChange={(updated) => {
            setCollections(updated);
            // If current filter is a deleted collection, reset
            if (selectedCollectionId && !updated.find((c) => c.id === selectedCollectionId)) {
              setSelectedCollectionId('');
            }
          }}
        />
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <>
      {/* Card skeleton (mobile/tablet) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      {/* List skeleton (desktop) */}
      <div className="hidden lg:block space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 py-4">
            <Skeleton className="w-[100px] h-[64px] rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 py-4">
            <Skeleton className="w-[100px] h-[64px] rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
