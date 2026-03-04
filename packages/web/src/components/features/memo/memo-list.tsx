'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowUpDown, Plus, Search, StickyNote, Tag, X} from 'lucide-react';
import {createMemo, getMemosPage, searchMemos} from '@/lib/actions/memos';
import {MemoCard} from './memo-card';
import {cn} from '@/lib/utils';

type SortKey = 'updatedAt' | 'createdAt' | 'title';
const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: '수정일순',
  createdAt: '생성일순',
  title: '제목순',
};

interface Memo {
  id: string;
  title: string | null;
  contentText: string;
  isPinned: boolean;
  updatedAt: Date;
  createdAt: Date;
  tags: string[] | null;
}

interface MemoListProps {
  initialMemos: Memo[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

function sortMemos(list: Memo[], key: SortKey): Memo[] {
  return [...list].sort((a, b) => {
    if (key === 'title') {
      return (a.title ?? '').localeCompare(b.title ?? '', 'ko');
    }
    return new Date(b[key]).getTime() - new Date(a[key]).getTime();
  });
}

export function MemoList({ initialMemos, initialHasMore, initialNextOffset }: MemoListProps) {
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>(initialMemos);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Memo[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close sort menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced server search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    // Clear tag filter when searching
    setActiveTag(null);

    setIsSearching(true);

    let cancelled = false;
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchMemos(searchQuery.trim());
        if (!cancelled) setSearchResults(results as Memo[]);
      } catch {
        if (!cancelled) setSearchResults(null);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getMemosPage(nextOffset);
      setMemos((prev) => [...prev, ...(result.memos as Memo[])]);
      setHasMore(result.hasMore);
      setNextOffset(result.nextOffset);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextOffset]);

  // Collect all unique tags from the full memo list (not filtered)
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const m of memos) {
      for (const tag of m.tags ?? []) {
        if (tag) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [memos]);

  const displayMemos = searchResults ?? memos;

  // Apply tag filter client-side
  const tagFiltered = useMemo(() => {
    if (!activeTag) return displayMemos;
    return displayMemos.filter((m) => (m.tags ?? []).includes(activeTag));
  }, [displayMemos, activeTag]);

  const sorted = useMemo(() => sortMemos(tagFiltered, sortKey), [tagFiltered, sortKey]);
  const pinned = useMemo(() => sorted.filter((m) => m.isPinned), [sorted]);
  const unpinned = useMemo(() => sorted.filter((m) => !m.isPinned), [sorted]);

  const handleNewMemo = useCallback(() => {
    startTransition(async () => {
      const memo = await createMemo();
      router.push(`/memo/${memo.id}`);
    });
  }, [router]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">메모</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {memos.length}개의 메모
            </p>
          </div>
          {/* Sort */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-accent"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SORT_LABELS[sortKey]}
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => { setSortKey(key); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      sortKey === key ? 'text-primary font-medium bg-accent/50' : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="메모 검색..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-accent/50 rounded-xl border-0 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60 transition-shadow"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide pb-0.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors shrink-0',
                  activeTag === tag
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-accent-foreground hover:bg-accent/80',
                )}
              >
                {tag}
                {activeTag === tag && (
                  <X className="h-3 w-3" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Memo list */}
      <div className="flex-1 overflow-y-auto">
        {memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <StickyNote className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-1">메모가 없습니다</h3>
            <p className="text-sm text-muted-foreground">
              새 메모를 작성해보세요
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] text-center px-4">
            <p className="text-sm text-muted-foreground">
              {activeTag
                ? `'${activeTag}' 태그가 달린 메모가 없습니다`
                : `"${searchQuery}" 검색 결과가 없습니다`}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div>
                <div className="px-4 py-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    고정됨
                  </span>
                </div>
                {pinned.map((m) => (
                  <MemoCard key={m.id} memo={m} highlight={searchQuery.trim()} />
                ))}
              </div>
            )}
            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <div className="px-4 py-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      메모
                    </span>
                  </div>
                )}
                {unpinned.map((m) => (
                  <MemoCard key={m.id} memo={m} highlight={searchQuery.trim()} />
                ))}
              </div>
            )}
            {/* Load more */}
            {hasMore && !searchQuery.trim() && !activeTag && (
              <div className="px-4 py-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {isLoadingMore ? '불러오는 중...' : '더 보기'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB - New Memo */}
      <button
        onClick={handleNewMemo}
        disabled={isPending}
        aria-label="새 메모 작성"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center z-20 disabled:opacity-50"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
