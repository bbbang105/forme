'use client';

import {useState} from 'react';
import {Loader2, Pause, Play, Plus, Settings2, Star, Trash2, Youtube} from 'lucide-react';
import {cn} from '@/lib/utils';
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

export interface VideoSource {
  id: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
  isFavorite: boolean;
  isActive: boolean;
  favoriteOrder: number;
  tags: string[] | null;
  createdAt: string;
}

const TAG_OPTIONS = [
  { value: 'economy', label: 'ECONOMY', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20' },
  { value: 'dev', label: 'DEV', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20' },
  { value: 'ai', label: 'AI', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20' },
  { value: 'uxui', label: 'UX/UI', color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 ring-pink-500/20' },
  { value: 'start-up', label: 'START-UP', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20' },
];

function getTagStyle(tag: string) {
  return TAG_OPTIONS.find((t) => t.value === tag) ?? {
    value: tag,
    label: tag,
    color: 'bg-muted text-muted-foreground ring-border',
  };
}

interface VideoSourceBarProps {
  sources: VideoSource[];
  onAdd: (channelUrl: string) => Promise<void>;
  onDelete: (id: string) => void;
  onUpdate: () => void;
}

function ChannelCard({
  source,
  deleting,
  onToggleFavorite,
  onToggleActive,
  onToggleTag,
  onDelete,
}: {
  source: VideoSource;
  deleting: string | null;
  onToggleFavorite: (source: VideoSource) => void;
  onToggleActive: (source: VideoSource) => void;
  onToggleTag: (source: VideoSource, tag: string) => void;
  onDelete: (source: VideoSource) => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const sourceTags = source.tags ?? [];

  return (
    <div className={cn('p-3 rounded-lg border border-border/60 space-y-2', !source.isActive && 'opacity-50')}>
      {/* Top row: icon + name + actions */}
      <div className="flex items-center gap-3">
        <div className={cn('flex items-center justify-center h-9 w-9 rounded-full shrink-0', source.isActive ? 'bg-red-500/10' : 'bg-muted')}>
          <Youtube className={cn('h-4 w-4', source.isActive ? 'text-red-500' : 'text-muted-foreground')} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{source.channelName}</p>
            {!source.isActive && (
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">비활성</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{source.channelId}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onToggleActive(source)}
            className={cn(
              'p-1.5 rounded-md transition-colors cursor-pointer',
              source.isActive
                ? 'text-emerald-500 hover:text-emerald-600'
                : 'text-muted-foreground/40 hover:text-emerald-500/60',
            )}
            aria-label={source.isActive ? '비활성화' : '활성화'}
          >
            {source.isActive ? <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => onToggleFavorite(source)}
            className={cn(
              'p-1.5 rounded-md transition-colors cursor-pointer',
              source.isFavorite
                ? 'text-amber-500'
                : 'text-muted-foreground/40 hover:text-amber-500/60',
            )}
            aria-label={source.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
          >
            <Star className="h-3.5 w-3.5" fill={source.isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <button
            onClick={() => onDelete(source)}
            disabled={deleting === source.id}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            aria-label={`${source.channelName} 삭제`}
          >
            {deleting === source.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {sourceTags.map((tag) => {
          const style = getTagStyle(tag);
          return (
            <span
              key={tag}
              className={cn(
                'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                style.color,
              )}
            >
              {style.label}
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => setTagOpen(!tagOpen)}
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
        >
          + 태그
        </button>
      </div>

      {/* Tag picker */}
      {tagOpen && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TAG_OPTIONS.map((tag) => {
            const isActive = sourceTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                type="button"
                onClick={() => onToggleTag(source, tag.value)}
                className={cn(
                  'inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset transition-all cursor-pointer',
                  isActive ? tag.color : 'bg-muted/30 text-muted-foreground ring-border/50 hover:ring-border',
                  isActive && 'ring-2',
                )}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VideoSourceBar({ sources, onAdd, onDelete, onUpdate }: VideoSourceBarProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VideoSource | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onAdd(url.trim());
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleFavorite = async (source: VideoSource) => {
    await fetch(`/api/video/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !source.isFavorite }),
    });
    onUpdate();
  };

  const handleToggleActive = async (source: VideoSource) => {
    await fetch(`/api/video/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    onUpdate();
  };

  const handleToggleTag = async (source: VideoSource, tag: string) => {
    const current = source.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    await fetch(`/api/video/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    });
    onUpdate();
  };

  const favoriteSources = sources.filter((s) => s.isFavorite);
  const normalSources = sources.filter((s) => !s.isFavorite);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          채널 관리
          {sources.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold h-4 min-w-4 px-1">
              {sources.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden inset-y-0 my-auto">
        <DialogHeader className="shrink-0">
          <DialogTitle>채널 관리</DialogTitle>
          <DialogDescription>
            구독할 유튜브 채널을 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* Add form */}
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="video-channel-url-input" className="sr-only">유튜브 채널 URL</label>
                <input
                  id="video-channel-url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/@채널명"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>
              <Button type="submit" size="sm" disabled={loading} className="gap-1 shrink-0">
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                추가
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              youtube.com/@handle 또는 youtube.com/channel/UC... 형식
            </p>
            {error && (
              <p className="text-xs text-destructive" role="alert" aria-live="polite">
                {error}
              </p>
            )}
          </form>

          {/* Channel list */}
          {sources.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              등록된 채널이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Favorite channels */}
              {favoriteSources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" />
                    즐겨찾기 ({favoriteSources.length})
                  </p>
                  {favoriteSources.map((source) => (
                    <ChannelCard
                      key={source.id}
                      source={source}
                      deleting={deleting}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleActive={handleToggleActive}
                      onToggleTag={handleToggleTag}
                      onDelete={(s) => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              )}

              {/* Normal channels */}
              {normalSources.length > 0 && (
                <div className="space-y-2">
                  {favoriteSources.length > 0 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      일반 ({normalSources.length})
                    </p>
                  )}
                  {normalSources.map((source) => (
                    <ChannelCard
                      key={source.id}
                      source={source}
                      deleting={deleting}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleActive={handleToggleActive}
                      onToggleTag={handleToggleTag}
                      onDelete={(s) => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>채널을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &lsquo;{deleteTarget?.channelName}&rsquo; 채널과 수집된 영상이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
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
