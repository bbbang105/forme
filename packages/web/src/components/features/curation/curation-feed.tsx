'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {CheckSquare, LayoutGrid, LayoutList, Newspaper, Trash2, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Skeleton} from '@/components/ui/skeleton';
import {Button} from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {CurationCard, type CurationItemData, CurationListRow} from './curation-card';
import {type StatusFilter} from './curation-filters';
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

const PAGE_SIZE = 12;

export function CurationFeed() {
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
  const [items, setItems] = useState<CurationItemData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasSources, setHasSources] = useState(true);
  const [favoriteSources, setFavoriteSources] = useState<{ id: string; name: string }[]>([]);

  // View density
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem('forme-curation-compact') === 'true'; } catch { return false; }
  });
  const toggleCompact = useCallback(() => {
    setCompact((prev) => {
      const next = !prev;
      try { localStorage.setItem('forme-curation-compact', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Selection & delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      const params = new URLSearchParams();
      const newCategory = updates.category ?? category;
      const newStatus = updates.status ?? status;
      const newSearch = updates.search ?? search;
      const newTags = updates.tags ?? selectedTags;
      const newSort = updates.sort ?? sort;
      const newSourceId = updates.sourceId ?? sourceId;

      if (newCategory) params.set('category', newCategory);
      if (newStatus && newStatus !== 'unread') params.set('status', newStatus);
      if (newSearch) params.set('search', newSearch);
      if (newTags.length > 0) params.set('tags', newTags.join(','));
      if (newSort !== 'latest') params.set('sort', newSort);
      if (newSourceId) params.set('sourceId', newSourceId);
      const qs = params.toString();
      router.push(`/curation${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, category, status, search, selectedTags, sort, sourceId]
  );

  // Fetch items
  const fetchItems = useCallback(
    async (cursorArg: string | null, append: boolean) => {
      if (!append) setLoading(true);

      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (tagsParam) params.set('tags', tagsParam);
      if (sort !== 'latest') params.set('sort', sort);
      if (sourceId) params.set('sourceId', sourceId);
      if (cursorArg) params.set('cursor', cursorArg);
      params.set('limit', String(PAGE_SIZE));

      try {
        const res = await fetch(`/api/curation?${params}`);
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
    [category, status, search, tagsParam, sort, sourceId]
  );

  // Fetch sources for categories + favorites
  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/curation/sources');
    if (!res.ok) return;
    const sources: { id: string; name: string; category: string; isFavorite: boolean }[] = await res.json();
    setHasSources(sources.length > 0);
    const cats = [...new Set(sources.map((s) => s.category))] as string[];
    setCategories(cats);
    setFavoriteSources(
      sources.filter((s) => s.isFavorite).map((s) => ({ id: s.id, name: s.name }))
    );
  }, []);

  // Load categories once on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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

      const res = await fetch(`/api/curation/${id}`, {
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

    const res = await fetch(`/api/curation/${id}`, {
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
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, memo } : item
      )
    );

    const res = await fetch(`/api/curation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo }),
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
  }, [fetchItems]);

  const isBookmarkTab = status === 'bookmarked';

  // ── Delete handlers ──

  const handleDeleteRequest = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    setDeleteTarget(item ? { id: item.id, title: item.title } : null);
  }, [items]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));

    const res = await fetch(`/api/curation/${deleteTarget.id}`, {
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
      const res = await fetch('/api/curation/bulk-delete', {
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
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [items, selectedIds.size]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // ── Keyboard navigation ──

  const [focusIndex, setFocusIndex] = useState(-1);
  const focusIndexRef = useRef(focusIndex);
  useEffect(() => { focusIndexRef.current = focusIndex; }, [focusIndex]);

  // Reset focus on filter/data change
  useEffect(() => { setFocusIndex(-1); }, [category, status, search, tagsParam, sort, sourceId]);

  useEffect(() => {
    if (selectMode || loading || items.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input or editable element
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;

      const idx = focusIndexRef.current;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(idx + 1, items.length - 1);
        setFocusIndex(next);
        scrollToItem(next);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(idx - 1, 0);
        setFocusIndex(prev);
        scrollToItem(prev);
      } else if (e.key === 'o' || e.key === 'Enter') {
        if (idx >= 0 && idx < items.length) {
          if (!items[idx].isRead) handleMarkRead(items[idx].id);
          window.open(items[idx].url, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'b') {
        if (idx >= 0 && idx < items.length) {
          handleToggleBookmark(items[idx].id, !items[idx].isBookmarked);
        }
      }
    }

    function scrollToItem(index: number) {
      const el = document.querySelector(`[data-curation-index="${index}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectMode, loading, items, handleMarkRead, handleToggleBookmark]);

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
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">큐레이션</h2>
            <p className="text-xs text-muted-foreground mt-0.5">관심 있는 RSS 피드를 구독하고 한곳에서 읽어보세요</p>
          </div>
          <SourceManager onCrawlComplete={handleCrawlComplete} onFavoritesChange={handleFavoritesChange} />
        </div>
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Newspaper className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">소스를 추가해보세요</h3>
          <p className="text-sm text-muted-foreground mb-4">
            RSS 피드 소스를 등록하면 자동으로 글을 수집합니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">큐레이션</h2>
          <p className="text-xs text-muted-foreground mt-0.5">관심 있는 RSS 피드를 구독하고 한곳에서 읽어보세요</p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Compact/Card toggle — mobile/tablet only */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={toggleCompact}
            aria-label={compact ? '카드 뷰' : '컴팩트 뷰'}
          >
            {compact ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
          </Button>
          {!selectMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectMode(true)}
              disabled={loading || items.length === 0}
            >
              <CheckSquare className="h-4 w-4 mr-1.5" />
              선택
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={exitSelectMode}
            >
              <X className="h-4 w-4 mr-1" />
              취소
            </Button>
          )}
          <SourceManager onCrawlComplete={handleCrawlComplete} onFavoritesChange={handleFavoritesChange} />
        </div>
      </div>

      {/* Select mode action bar */}
      {selectMode && (
        <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-lg bg-muted/60 border border-border/60">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-sm font-medium text-primary hover:underline"
            >
              {selectedIds.size === items.length ? '전체 해제' : '전체 선택'}
            </button>
            <span className="text-sm text-muted-foreground">
              {selectedIds.size}개 선택됨
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            삭제
          </Button>
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
      />

      {/* Feed */}
      <div className="min-h-[30vh]">
      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? `"${search}" 검색 결과가 없습니다.`
              : selectedTags.length > 0
                ? '선택한 태그에 맞는 글이 없습니다.'
                : status === 'unread'
                  ? '안읽은 글이 없습니다. 모두 읽었어요!'
                  : status === 'read'
                    ? '읽은 글이 없습니다.'
                    : status === 'bookmarked'
                      ? '북마크한 글이 없습니다.'
                      : '수집된 글이 없습니다. 소스를 추가하고 수집해보세요.'}
          </p>
        </div>
      ) : (
        <>
          {/* Card grid (mobile/tablet) */}
          <div className={cn(
            'lg:hidden',
            compact ? 'flex flex-col gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'
          )}>
            {items.map((item, i) => (
              <div
                key={item.id}
                data-curation-index={i}
                className={cn(focusIndex === i && 'ring-2 ring-primary/50 rounded-xl')}
              >
                <CurationCard
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  showMemo={isBookmarkTab}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                  compact={compact}
                />
              </div>
            ))}
          </div>

          {/* List view (desktop) */}
          <div className="hidden lg:block divide-y divide-border/60">
            {items.map((item, i) => (
              <div
                key={item.id}
                data-curation-index={i}
                className={cn(focusIndex === i && 'ring-2 ring-primary/50 rounded-lg')}
              >
                <CurationListRow
                  item={item}
                  onToggleBookmark={handleToggleBookmark}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDeleteRequest}
                  onMemoChange={handleMemoChange}
                  showMemo={isBookmarkTab}
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
          <div className="flex justify-end gap-2 mt-2">
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={handleDeleteConfirm}
              >
                삭제
              </Button>
            </AlertDialogAction>
          </div>
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
          <div className="flex justify-end gap-2 mt-2">
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={handleBulkDeleteConfirm}
              >
                {selectedIds.size}개 삭제
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
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
