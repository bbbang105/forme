'use client';

import {useState} from 'react';
import {Clock, HardDrive, MoreHorizontal, Pause, Pencil, Play, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {type Episode, usePlayer} from './player-context';

interface EpisodeCardProps {
  episode: Episode;
  onEdit: (episode: Episode) => void;
  onDelete: (episode: Episode) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;

  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function EpisodeCard({ episode, onEdit, onDelete }: EpisodeCardProps) {
  const { episode: currentEpisode, isPlaying, play, togglePlay } = usePlayer();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrentEpisode = currentEpisode?.id === episode.id;

  const handlePlayClick = () => {
    if (isCurrentEpisode) {
      togglePlay();
    } else {
      play(episode);
    }
    setMenuOpen(false);
  };

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 p-4 rounded-xl border transition-all duration-200',
        isCurrentEpisode
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/60 bg-card hover:border-primary/20 hover:shadow-sm'
      )}
    >
      {/* Play button / waveform indicator */}
      <button
        onClick={handlePlayClick}
        className={cn(
          'relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
          'transition-all duration-200 active:scale-90',
          isCurrentEpisode
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'bg-primary/10 text-primary hover:bg-primary/20'
        )}
        aria-label={isCurrentEpisode && isPlaying ? '일시정지' : '재생'}
      >
        {isCurrentEpisode && isPlaying ? (
          <Pause className="h-5 w-5" fill="currentColor" />
        ) : (
          <Play className="h-5 w-5" fill="currentColor" style={{ marginLeft: 2 }} />
        )}
        {isCurrentEpisode && isPlaying && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary">
            <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
          </span>
        )}
      </button>

      {/* Episode info */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-semibold line-clamp-2 leading-snug',
            isCurrentEpisode ? 'text-primary' : 'text-foreground'
          )}
        >
          {episode.title}
        </p>
        {episode.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {episode.description}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            {formatDate(episode.publishedAt)}
          </span>
          {episode.duration && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(episode.duration)}
            </span>
          )}
          {episode.fileSize && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              {formatBytes(episode.fileSize)}
            </span>
          )}
        </div>
      </div>

      {/* More menu */}
      <div className="relative shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="더보기"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden">
              <button
                onClick={() => { onEdit(episode); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-accent transition-colors"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                편집
              </button>
              <button
                onClick={() => { onDelete(episode); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
