'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  isActive: boolean;
  createdAt: string;
}

type View = 'list' | 'add' | 'crawl';

interface SourceManagerProps {
  onCrawlComplete: () => void;
}

export function SourceManager({ onCrawlComplete }: SourceManagerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
            {view === 'crawl' && '수집 진행'}
          </DialogTitle>
          <DialogDescription>
            {view === 'list' && 'RSS 소스를 관리하고 수집합니다.'}
            {view === 'add' && '새 RSS 소스를 추가합니다.'}
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
                onClick={() => setView('crawl')}
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
                          onClick={() => handleDelete(source.id)}
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

        {/* Crawl view */}
        {view === 'crawl' && (
          <CrawlProgress
            onComplete={() => {
              onCrawlComplete();
            }}
            onClose={() => setView('list')}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
