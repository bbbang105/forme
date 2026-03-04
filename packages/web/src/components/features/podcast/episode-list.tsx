'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {AlertCircle, Headphones, Loader2, RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import {EpisodeCard} from './episode-card';
import type {Episode} from './player-context';

const EditEpisodeDialog = dynamic(
  () => import('./edit-episode-dialog').then((m) => m.EditEpisodeDialog),
  { ssr: false }
);

const DeleteEpisodeDialog = dynamic(
  () => import('./delete-episode-dialog').then((m) => m.DeleteEpisodeDialog),
  { ssr: false }
);

const PAGE_SIZE = 20;

interface EpisodeListProps {
  newEpisode?: Episode | null;
}

export function EpisodeList({ newEpisode }: EpisodeListProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Episode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Episode | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(false);

  const fetchEpisodes = useCallback(async (cursorArg: string | null, append: boolean) => {
    if (!append) setLoading(true);

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursorArg) params.set('cursor', cursorArg);

    try {
      const res = await fetch(`/api/podcast/episodes?${params}`);
      if (!res.ok) {
        if (!append) setFetchError('에피소드를 불러오는데 실패했습니다.');
        return;
      }
      const data = await res.json();
      setFetchError(null);

      if (append) {
        setEpisodes((prev) => [...prev, ...data.episodes]);
      } else {
        setEpisodes(data.episodes);
      }
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      if (!append) setFetchError('네트워크 오류가 발생했습니다.');
    } finally {
      if (!append) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEpisodes(null, false);
  }, [fetchEpisodes]);

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
          fetchEpisodes(cursorRef.current, true).finally(() => {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          });
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchEpisodes, loading]);

  const handleEditSuccess = useCallback((updated: Episode) => {
    setEpisodes((prev) =>
      prev.map((ep) => (ep.id === updated.id ? { ...ep, ...updated } : ep))
    );
    setEditTarget(null);
  }, []);

  const handleDeleteSuccess = useCallback((id: string) => {
    setEpisodes((prev) => prev.filter((ep) => ep.id !== id));
    setDeleteTarget(null);
  }, []);

  // React to new episode from parent
  const lastNewEpisodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (newEpisode && newEpisode.id !== lastNewEpisodeRef.current) {
      lastNewEpisodeRef.current = newEpisode.id;
      setEpisodes((prev) => [newEpisode, ...prev]);
    }
  }, [newEpisode]);

  if (loading) {
    return <EpisodeListSkeleton />;
  }

  if (fetchError) {
    return <ErrorState message={fetchError} onRetry={() => fetchEpisodes(null, false)} />;
  }

  if (episodes.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <div className="space-y-3">
        {episodes.map((ep) => (
          <EpisodeCard
            key={ep.id}
            episode={ep}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {editTarget && (
        <EditEpisodeDialog
          episode={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          onSuccess={handleEditSuccess}
        />
      )}

      {deleteTarget && (
        <DeleteEpisodeDialog
          episode={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <div className="relative mb-4">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Headphones className="h-10 w-10 text-primary" />
        </div>
        <span className="absolute -top-1 -right-1 text-2xl">🎵</span>
      </div>
      <h3 className="text-base font-semibold mb-1.5">아직 에피소드가 없어요</h3>
      <p className="text-sm text-muted-foreground max-w-[240px] leading-relaxed">
        첫 번째 AI 팟캐스트 에피소드를 업로드해보세요. + 버튼을 눌러 시작하세요!
      </p>
    </div>
  );
}

function EpisodeListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-4 rounded-xl border border-border/60"
        >
          <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
