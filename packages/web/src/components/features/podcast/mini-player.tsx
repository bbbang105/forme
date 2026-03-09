'use client';

import {useState} from 'react';
import {Loader2, Mic, Pause, Play, RotateCcw, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlayer, usePlayerTime} from './player-context';
import {AudioPlayer} from './audio-player';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MiniPlayer() {
  const { episode, isPlaying, isRestored, isLoading, togglePlay, close } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!episode) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isExpanded) {
    return (
      <AudioPlayer onCollapse={() => setIsExpanded(false)} />
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40',
        'border-t border-border/60',
        'bg-background/98 backdrop-blur-md',
        'shadow-[0_-2px_12px_rgba(0,0,0,0.06)]',
        'animate-in slide-in-from-bottom-2 duration-300'
      )}
    >
      {/* Thin progress bar at the top */}
      <div className="h-0.5 bg-border">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 max-w-7xl mx-auto">
        {/* Episode icon */}
        <button
          onClick={() => setIsExpanded(true)}
          className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          aria-label="플레이어 확장"
        >
          <Mic className="h-5 w-5 text-primary" />
        </button>

        {/* Title - tap to expand */}
        <button
          onClick={() => setIsExpanded(true)}
          className="flex-1 min-w-0 text-left"
          aria-label="플레이어 확장"
        >
          <p className="text-sm font-medium truncate">{episode.title}</p>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? '로딩 중...'
              : isRestored
                ? `${formatTime(currentTime)}부터 이어듣기`
                : isPlaying
                  ? '재생 중'
                  : '일시정지'}
          </p>
        </button>

        {/* Play / Resume */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-full',
            'hover:bg-primary/90 active:scale-90 transition-all shrink-0',
            'disabled:opacity-70',
            isRestored
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-primary text-primary-foreground',
          )}
          disabled={isLoading}
          aria-label={isRestored ? '이어듣기' : isPlaying ? '일시정지' : '재생'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRestored ? (
            <RotateCcw className="h-4 w-4" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" fill="currentColor" />
          ) : (
            <Play className="h-4 w-4" fill="currentColor" style={{ marginLeft: 1 }} />
          )}
        </button>

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 active:scale-90"
          aria-label="플레이어 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
