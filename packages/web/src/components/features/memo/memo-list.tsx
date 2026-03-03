'use client';

import {useCallback, useMemo, useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Plus, Search, StickyNote} from 'lucide-react';
import {createMemo} from '@/lib/actions/memos';
import {MemoCard} from './memo-card';

interface Memo {
  id: string;
  title: string | null;
  contentText: string;
  isPinned: boolean;
  updatedAt: Date;
}

interface MemoListProps {
  memos: Memo[];
}

export function MemoList({ memos }: MemoListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return memos;
    const q = searchQuery.toLowerCase();
    return memos.filter(
      (m) =>
        (m.title?.toLowerCase().includes(q)) ||
        m.contentText.toLowerCase().includes(q)
    );
  }, [memos, searchQuery]);

  const pinned = useMemo(() => filtered.filter((m) => m.isPinned), [filtered]);
  const unpinned = useMemo(() => filtered.filter((m) => !m.isPinned), [filtered]);

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
        </div>
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] text-center px-4">
            <p className="text-sm text-muted-foreground">
              &ldquo;{searchQuery}&rdquo; 검색 결과가 없습니다
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
                {pinned.map((memo) => (
                  <MemoCard key={memo.id} memo={memo} />
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
                {unpinned.map((memo) => (
                  <MemoCard key={memo.id} memo={memo} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB - New Memo */}
      <button
        onClick={handleNewMemo}
        disabled={isPending}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center z-20 disabled:opacity-50"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
