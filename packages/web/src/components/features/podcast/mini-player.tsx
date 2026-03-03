'use client';

import {useState} from 'react';
import {Loader2, Pause, Play, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlayer} from './player-context';
import {AudioPlayer} from './audio-player';

export function MiniPlayer() {
  const { episode, isPlaying, isLoading, currentTime, duration, togglePlay, close } = usePlayer();
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
          <span className="text-lg">🎙️</span>
        </button>

        {/* Title - tap to expand */}
        <button
          onClick={() => setIsExpanded(true)}
          className="flex-1 min-w-0 text-left"
          aria-label="플레이어 확장"
        >
          <p className="text-sm font-medium truncate">{episode.title}</p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? '로딩 중...' : isPlaying ? '재생 중' : '일시정지'}
          </p>
        </button>

        {/* Play / Pause */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-full',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 active:scale-90 transition-all shrink-0',
            'disabled:opacity-70'
          )}
          disabled={isLoading}
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
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
