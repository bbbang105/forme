'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Newspaper } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CurationCard, CurationListRow, type CurationItemData } from './curation-card';
import { CurationFilters, type StatusFilter } from './curation-filters';
import { CurationSearch } from './curation-search';
import { SourceManager } from './source-manager';

const PAGE_SIZE = 12;

export function CurationFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state from URL
  const category = searchParams.get('category') ?? '';
  const status = (searchParams.get('status') ?? '') as StatusFilter;
  const search = searchParams.get('search') ?? '';

  // Data state
  const [items, setItems] = useState<CurationItemData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasSources, setHasSources] = useState(true);

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
    (newCategory: string, newStatus: StatusFilter, newSearch: string) => {
      const params = new URLSearchParams();
      if (newCategory) params.set('category', newCategory);
      if (newStatus) params.set('status', newStatus);
      if (newSearch) params.set('search', newSearch);
      const qs = params.toString();
      router.push(`/curation${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router]
  );

  // Fetch items
  const fetchItems = useCallback(
    async (cursorArg: string | null, append: boolean) => {
      if (!append) setLoading(true);

      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
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
    [category, status, search]
  );

  // Fetch sources for categories
  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/curation/sources');
    if (!res.ok) return;
    const sources = await res.json();
    setHasSources(sources.length > 0);
    const cats = [...new Set(sources.map((s: { category: string }) => s.category))] as string[];
    setCategories(cats);
  }, []);

  // Load categories once on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch items on filter changes
  useEffect(() => {
    fetchItems(null, false);
  }, [category, status, search, fetchItems]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

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
  }, [fetchItems]);

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
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      )
    );

    await fetch(`/api/curation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });
  }, []);

  const handleCrawlComplete = useCallback(() => {
    fetchCategories();
    fetchItems(null, false);
  }, [fetchItems, fetchCategories]);

  // Empty state: no sources
  if (!loading && !hasSources) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">큐레이션</h2>
          <SourceManager onCrawlComplete={handleCrawlComplete} />
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
        <SourceManager onCrawlComplete={handleCrawlComplete} />
      </div>

      {/* Search */}
      <div className="mb-4">
        <CurationSearch
          value={search}
          onChange={(v) => updateFilters(category, status, v)}
        />
      </div>

      {/* Filters */}
      <div className="mb-6">
        <CurationFilters
          categories={categories}
          selectedCategory={category}
          onCategoryChange={(c) => updateFilters(c, status, search)}
          status={status}
          onStatusChange={(s) => updateFilters(category, s, search)}
        />
      </div>

      {/* Feed */}
      {loading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? `"${search}" 검색 결과가 없습니다.`
              : status === 'unread'
                ? '안읽은 글이 없습니다.'
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
