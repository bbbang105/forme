'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Clock, Newspaper, Sparkles, Star} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Skeleton} from '@/components/ui/skeleton';
import {CurationCard, type CurationItemData, CurationListRow} from './curation-card';
import {CurationFilters, type StatusFilter} from './curation-filters';
import {CurationSearch} from './curation-search';
import {SourceManager} from './source-manager';

const PAGE_SIZE = 12;

type SortMode = 'latest' | 'recommended';

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
  // `loading` is a dependency so the observer re-attaches to the NEW sentinel
  // DOM node after a loading cycle unmounts/remounts the sentinel.
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
        // Revert on failure
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
    // On the unread tab, remove the item immediately; otherwise just toggle
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
      // Revert: re-fetch to restore correct state
      fetchItems(null, false);
    }
  }, [status, fetchItems]);

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
          <h2 className="text-lg font-semibold">큐레이션</h2>
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
        <h2 className="text-lg font-semibold">큐레이션</h2>
        <SourceManager onCrawlComplete={handleCrawlComplete} onFavoritesChange={handleFavoritesChange} />
      </div>

      {/* Search */}
      <div className="mb-4">
        <CurationSearch
          value={search}
          onChange={(v) => updateFilters({ search: v })}
        />
      </div>

      {/* Favorite sources bar */}
      {favoriteSources.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {favoriteSources.map((src) => (
            <button
              key={src.id}
              onClick={() =>
                updateFilters({ sourceId: sourceId === src.id ? '' : src.id })
              }
              className={cn(
                'inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border',
                sourceId === src.id
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Star className="h-3 w-3 text-amber-500" fill="currentColor" />
              {src.name}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <CurationFilters
          categories={categories}
          selectedCategory={category}
          onCategoryChange={(c) => updateFilters({ category: c })}
          status={status}
          onStatusChange={(s) => updateFilters({ status: s })}
          selectedTags={selectedTags}
          onTagsChange={(tags) => updateFilters({ tags })}
        />
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-1.5 mb-6">
        <SortButton
          active={sort === 'latest'}
          onClick={() => updateFilters({ sort: 'latest' })}
          icon={<Clock className="h-3.5 w-3.5" />}
          label="최신순"
        />
        <SortButton
          active={sort === 'recommended'}
          onClick={() => updateFilters({ sort: 'recommended' })}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="추천순"
        />
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {items.map((item) => (
              <CurationCard
                key={item.id}
                item={item}
                onToggleBookmark={handleToggleBookmark}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>

          {/* List view (desktop) */}
          <div className="hidden lg:block divide-y divide-border/60">
            {items.map((item) => (
              <CurationListRow
                key={item.id}
                item={item}
                onToggleBookmark={handleToggleBookmark}
                onMarkRead={handleMarkRead}
              />
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
    </div>
  );
}

function SortButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
        'transition-colors cursor-pointer',
        active
          ? 'bg-foreground text-background'
          : 'border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {icon}
      {label}
    </button>
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
