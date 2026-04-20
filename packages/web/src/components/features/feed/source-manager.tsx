'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {Loader2, Plus, RefreshCw, Settings2, Star} from 'lucide-react';
import {closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,} from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy,} from '@dnd-kit/sortable';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {SourceForm} from './source-form';
import {type Source, SourceCard} from './source-card';
import {CrawlSettingsForm} from './crawl-settings-form';
import dynamic from 'next/dynamic';

const CrawlProgress = dynamic(
  () => import('./crawl-progress').then((m) => m.CrawlProgress),
  {
    ssr: true,
    loading: () => (
      <div className="animate-pulse bg-muted rounded-lg h-32 w-full" />
    ),
  }
);

type View = 'list' | 'add' | 'edit' | 'crawl-settings' | 'crawl';

interface SourceManagerProps {
  onCrawlComplete: () => void;
  onFavoritesChange?: () => void;
}

export function SourceManager({ onCrawlComplete, onFavoritesChange }: SourceManagerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [editTarget, setEditTarget] = useState<Source | null>(null);
  const [crawlSince, setCrawlSince] = useState<string | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const favoriteSources = useMemo(
    () => sources.filter((s) => s.isFavorite),
    [sources]
  );
  const normalSources = useMemo(
    () => sources.filter((s) => !s.isFavorite),
    [sources]
  );
  const favoriteIds = useMemo(
    () => favoriteSources.map((s) => s.id),
    [favoriteSources]
  );

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feed/sources');
      if (res.ok) {
        setSources(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchSources();
      setView('list');
    }
  }, [open, fetchSources]);

  const handleAddSource = async (data: {
    name: string;
    url: string;
    category: string;
    rssUrl?: string;
    tags?: string[];
  }) => {
    const res = await fetch('/api/feed/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '소스 추가 실패');
    }

    await fetchSources();
    setView('list');
  };

  const handleEditSource = async (data: {
    name: string;
    url: string;
    category: string;
    rssUrl?: string;
    tags?: string[];
  }) => {
    if (!editTarget) return;

    const res = await fetch(`/api/feed/sources/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        category: data.category,
        rssUrl: data.rssUrl || null,
        tags: data.tags ?? [],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '소스 수정 실패');
    }

    await fetchSources();
    setEditTarget(null);
    setView('list');
  };

  const handleToggleActive = async (source: Source) => {
    const res = await fetch(`/api/feed/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !source.isActive }),
    });

    if (res.ok) {
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, isActive: !s.isActive } : s
        )
      );
    }
  };

  const handleToggleFavorite = async (source: Source) => {
    // Optimistic update
    setSources((prev) =>
      prev.map((s) =>
        s.id === source.id ? { ...s, isFavorite: !s.isFavorite } : s
      )
    );

    const res = await fetch(`/api/feed/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !source.isFavorite }),
    });

    if (res.ok) {
      onFavoritesChange?.();
    } else {
      // Revert on failure
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, isFavorite: source.isFavorite } : s
        )
      );
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/feed/sources/${id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        setSources((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = favoriteSources.findIndex((s) => s.id === active.id);
    const newIndex = favoriteSources.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Compute new order
    const reordered = [...favoriteSources];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const updatedFavorites = reordered.map((s, i) => ({
      ...s,
      favoriteOrder: i,
    }));

    // Optimistic update
    setSources([...updatedFavorites, ...normalSources]);

    // Persist to API
    fetch('/api/feed/sources/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: updatedFavorites.map((s) => ({
          id: s.id,
          favoriteOrder: s.favoriteOrder,
        })),
      }),
    }).then((res) => {
      if (res.ok) onFavoritesChange?.();
      else fetchSources();
    }).catch(() => {
      fetchSources();
    });
  };

  const existingCategories = [...new Set(sources.map((s) => s.category))];

  const cardProps = {
    deleting,
    onToggleFavorite: handleToggleFavorite,
    onToggleActive: handleToggleActive,
    onEdit: (source: Source) => {
      setEditTarget(source);
      setView('edit');
    },
    onDelete: (source: Source) => setDeleteTarget(source),
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="sr-only">소스 관리</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {view === 'list' && '소스 관리'}
            {view === 'add' && '소스 추가'}
            {view === 'edit' && '소스 수정'}
            {view === 'crawl-settings' && '수집 설정'}
            {view === 'crawl' && '수집 진행'}
          </DialogTitle>
          <DialogDescription>
            {view === 'list' && 'RSS 소스를 관리하고 수집합니다.'}
            {view === 'add' && '새 RSS 소스를 추가합니다.'}
            {view === 'edit' && '소스 정보를 수정합니다.'}
            {view === 'crawl-settings' && '수집할 기간을 선택하세요.'}
            {view === 'crawl' && 'RSS 피드를 수집하고 있습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* List view */}
          {view === 'list' && (
            <div className="space-y-4">
              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setView('add')}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  소스 추가
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView('crawl-settings')}
                  className="gap-1.5"
                  disabled={sources.filter((s) => s.isActive && s.rssUrl).length === 0}
                >
                  <RefreshCw className="h-4 w-4" />
                  지금 수집
                </Button>
              </div>

              {/* Source list */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : sources.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  등록된 소스가 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Favorite sources (draggable) */}
                  {favoriteSources.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Star className="h-3 w-3" fill="currentColor" />
                        즐겨찾기 ({favoriteSources.length})
                      </p>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={favoriteIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {favoriteSources.map((source) => (
                              <SourceCard
                                key={source.id}
                                source={source}
                                isDraggable
                                {...cardProps}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {/* Normal sources */}
                  {normalSources.length > 0 && (
                    <div className="space-y-2">
                      {favoriteSources.length > 0 && (
                        <p className="text-xs font-medium text-muted-foreground">
                          일반 ({normalSources.length})
                        </p>
                      )}
                      {normalSources.map((source) => (
                        <SourceCard
                          key={source.id}
                          source={source}
                          {...cardProps}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add view */}
          {view === 'add' && (
            <SourceForm
              existingCategories={existingCategories}
              onSubmit={handleAddSource}
              onCancel={() => setView('list')}
            />
          )}

          {/* Edit view */}
          {view === 'edit' && editTarget && (
            <SourceForm
              existingCategories={existingCategories}
              onSubmit={handleEditSource}
              onCancel={() => {
                setEditTarget(null);
                setView('list');
              }}
              initialData={{
                name: editTarget.name,
                url: editTarget.url,
                category: editTarget.category,
                rssUrl: editTarget.rssUrl,
                tags: editTarget.tags,
              }}
            />
          )}

          {/* Crawl settings view */}
          {view === 'crawl-settings' && (
            <CrawlSettingsForm
              onStart={(since) => {
                setCrawlSince(since);
                setView('crawl');
              }}
              onCancel={() => setView('list')}
            />
          )}

          {/* Crawl view */}
          {view === 'crawl' && (
            <CrawlProgress
              since={crawlSince}
              onComplete={() => {
                onCrawlComplete();
              }}
              onClose={() => setView('list')}
            />
          )}
        </div>
      </DialogContent>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>소스를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &lsquo;{deleteTarget?.name}&rsquo; 소스와 수집된 아이템이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  handleDelete(deleteTarget.id);
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
    </Dialog>
  );
}
