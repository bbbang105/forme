'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/curation-utils';
import { SourceForm } from './source-form';
import { CrawlProgress } from './crawl-progress';

interface Source {
  id: string;
  name: string;
  url: string;
  rssUrl: string | null;
  category: string;
  tags: string[] | null;
  isActive: boolean;
  createdAt: string;
}

type View = 'list' | 'add' | 'crawl-settings' | 'crawl';

type CrawlRange = '7d' | '30d' | 'custom';

function computeSince(range: CrawlRange, customDate: string): string | undefined {
  switch (range) {
    case '7d':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'custom': {
      if (!customDate) return undefined;
      const d = new Date(customDate);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
  }
}

interface SourceManagerProps {
  onCrawlComplete: () => void;
}

export function SourceManager({ onCrawlComplete }: SourceManagerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [crawlRange, setCrawlRange] = useState<CrawlRange>('7d');
  const [customDate, setCustomDate] = useState('');
  const [crawlSince, setCrawlSince] = useState<string | undefined>();

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/curation/sources');
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
    const res = await fetch('/api/curation/sources', {
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

  const handleToggleActive = async (source: Source) => {
    const res = await fetch(`/api/curation/sources/${source.id}`, {
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

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/curation/sources/${id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        setSources((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  };

  const existingCategories = [...new Set(sources.map((s) => s.category))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">소스 관리</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {view === 'list' && '소스 관리'}
            {view === 'add' && '소스 추가'}
            {view === 'crawl-settings' && '수집 설정'}
            {view === 'crawl' && '수집 진행'}
          </DialogTitle>
          <DialogDescription>
            {view === 'list' && 'RSS 소스를 관리하고 수집합니다.'}
            {view === 'add' && '새 RSS 소스를 추가합니다.'}
            {view === 'crawl-settings' && '수집할 기간을 선택하세요.'}
            {view === 'crawl' && 'RSS 피드를 수집하고 있습니다.'}
          </DialogDescription>
        </DialogHeader>

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
                onClick={() => {
                  setCrawlRange('7d');
                  setCustomDate('');
                  setView('crawl-settings');
                }}
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
              <div className="space-y-2">
                {sources.map((source) => {
                  const catStyle = getCategoryStyle(source.category);
                  return (
                    <div
                      key={source.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border border-border/60',
                        !source.isActive && 'opacity-50'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {source.name}
                          </span>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                              catStyle.bg,
                              catStyle.text,
                              catStyle.ring
                            )}
                          >
                            {catStyle.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {source.url}
                        </p>
                        {!source.rssUrl && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            RSS 미감지
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleActive(source)}
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium transition-colors',
                            source.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {source.isActive ? '활성' : '비활성'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(source)}
                          disabled={deleting === source.id}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="소스 삭제"
                        >
                          {deleting === source.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
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

        {/* Crawl settings view */}
        {view === 'crawl-settings' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                수집 기간
              </label>
              <div className="flex gap-2">
                {([
                  { value: '7d', label: '최근 7일' },
                  { value: '30d', label: '최근 30일' },
                  { value: 'custom', label: '직접 선택' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCrawlRange(opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      crawlRange === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {crawlRange === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setCrawlSince(computeSince(crawlRange, customDate));
                  setView('crawl');
                }}
                disabled={crawlRange === 'custom' && !customDate}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                수집 시작
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setView('list')}
              >
                취소
              </Button>
            </div>
          </div>
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
