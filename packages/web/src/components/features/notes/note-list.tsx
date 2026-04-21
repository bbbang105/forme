'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Plus, Search, StickyNote, X} from 'lucide-react';
import {createNote, getNotesPage, searchNotes} from '@/lib/actions/notes';
import {NoteCard} from './note-card';
import {cn} from '@/lib/utils';

type SortKey = 'updatedAt' | 'createdAt' | 'title';
const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: 'Updated',
  createdAt: 'Created',
  title: 'Title',
};

interface Note {
  id: string;
  title: string | null;
  contentText: string;
  isPinned: boolean;
  updatedAt: Date;
  createdAt: Date;
  tags: string[] | null;
}

interface NoteListProps {
  initialNotes: Note[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

function sortMemos(list: Note[], key: SortKey): Note[] {
  return [...list].sort((a, b) => {
    if (key === 'title') {
      return (a.title ?? '').localeCompare(b.title ?? '', 'ko');
    }
    return new Date(b[key]).getTime() - new Date(a[key]).getTime();
  });
}

export function NoteList({ initialNotes, initialHasMore, initialNextOffset }: NoteListProps) {
  const router = useRouter();
  const [notes, setNotesList] = useState<Note[]>(initialNotes);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Note[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // initialNotes 변경 시 state 동기화 — 검색/로드모어 중에는 덮어쓰지 않음
  // 로컬 편집(검색/loadMore)이 활성화된 동안에는 서버 데이터로 덮어쓰지 않는다.
  // key-based reset: 부모가 key를 변경하면 컴포넌트가 재마운트되어 state가 초기화된다.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    // 검색 중이거나 추가 로드 중이면 서버 데이터로 덮어쓰지 않음
    if (searchQuery.trim() || isLoadingMore) return;
    setNotesList(initialNotes);
    setHasMore(initialHasMore);
    setNextOffset(initialNextOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotes, initialHasMore, initialNextOffset]);

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
        const results = await searchNotes(searchQuery.trim());
        if (!cancelled) setSearchResults(results as Note[]);
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
      const result = await getNotesPage(nextOffset);
      setNotesList((prev) => [...prev, ...(result.notes as Note[])]);
      setHasMore(result.hasMore);
      setNextOffset(result.nextOffset);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextOffset]);

  // Collect all unique tags from the full note list (not filtered)
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const m of notes) {
      for (const tag of m.tags ?? []) {
        if (tag) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [notes]);

  const displayMemos = searchResults ?? notes;

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
      const note = await createNote();
      router.push(`/notes/${note.id}`);
    });
  }, [router]);

  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto w-full">
      {/* Masthead */}
      <div className="px-4 sm:px-5 pt-8 pb-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground shrink-0">
              <span className="text-primary" aria-hidden="true">—</span> Notes{notes.length > 0 ? ` · ${notes.length}` : ''}
            </span>
            <h2 className="font-display text-2xl sm:text-3xl leading-none text-foreground truncate">
              노트
            </h2>
          </div>
          {/* Sort */}
          <div className="relative shrink-0" ref={sortRef}>
            <button
              type="button"
              onClick={() => setShowSortMenu((v) => !v)}
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              {SORT_LABELS[sortKey]} ↕
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 bg-popover border border-border py-1 z-20 min-w-[120px] rounded-sm">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => { setSortKey(key); setShowSortMenu(false); }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                      sortKey === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {sortKey === key && <span className="mr-1" aria-hidden="true">—</span>}
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search (hairline input) */}
        <div className="relative">
          <Search
            className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes…"
            aria-label="노트 검색"
            className={cn(
              'w-full h-10 pl-6 pr-7 bg-transparent',
              'border-b border-border',
              'text-base placeholder:text-muted-foreground',
              'focus:outline-none focus:border-primary',
              'transition-colors',
            )}
          />
          {isSearching && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="h-3.5 w-3.5 border border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide pb-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
              Tags
            </span>
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                  className={cn(
                    'shrink-0 inline-flex items-baseline gap-1.5 text-xs transition-colors cursor-pointer',
                    active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {active && (
                    <span aria-hidden="true" className="font-mono text-[11px] tracking-[0.1em]">
                      —
                    </span>
                  )}
                  <span>{tag}</span>
                  {active && <X className="h-3 w-3" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Memo list */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4 max-w-sm mx-auto">
            <StickyNote className="h-6 w-6 text-primary mb-5" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
              <span className="text-primary" aria-hidden="true">—</span> Empty notebook
            </p>
            <h3 className="font-display text-2xl leading-snug text-foreground mb-3">
              Start a blank page.
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              첫 노트를 작성하면 이 책장에 순서대로 쌓입니다.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] text-center px-4 max-w-sm mx-auto">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
              <span className="text-primary" aria-hidden="true">—</span> Nothing here
            </p>
            <p className="font-display text-xl leading-snug text-foreground">
              {activeTag
                ? `'${activeTag}' 태그가 달린 노트가 없습니다.`
                : `"${searchQuery}" 검색 결과가 없습니다.`}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div>
                <div className="px-4 sm:px-5 py-2 border-b border-border/60">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="text-primary" aria-hidden="true">—</span> Pinned
                  </span>
                </div>
                {pinned.map((m) => (
                  <NoteCard key={m.id} note={m} highlight={searchQuery.trim()} />
                ))}
              </div>
            )}
            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <div className="px-4 sm:px-5 py-2 border-b border-border/60">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="text-primary" aria-hidden="true">—</span> All notes
                    </span>
                  </div>
                )}
                {unpinned.map((m) => (
                  <NoteCard key={m.id} note={m} highlight={searchQuery.trim()} />
                ))}
              </div>
            )}
            {/* Load more */}
            {hasMore && !searchQuery.trim() && !activeTag && (
              <div className="px-4 sm:px-5 py-6 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary hover:text-primary/80 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingMore ? 'Loading…' : '— Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB - New Memo */}
      <button
        type="button"
        onClick={handleNewMemo}
        disabled={isPending}
        aria-label="새 노트 작성"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center z-20 disabled:opacity-50"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
