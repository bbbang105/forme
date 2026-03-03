'use client';

import {useCallback} from 'react';
import {ChevronDown, Loader2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X,} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlayer} from './player-context';
import {Button} from '@/components/ui/button';

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPlayerProps {
  onCollapse?: () => void;
}

export function AudioPlayer({ onCollapse }: AudioPlayerProps) {
  const {
    episode,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    isLoading,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    skipForward,
    skipBackward,
    close,
  } = usePlayer();

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek]
  );

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume]
  );

  if (!episode) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn(
      'fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40',
      'border-t border-border/60 bg-background/98 backdrop-blur-md',
      'shadow-[0_-4px_24px_rgba(0,0,0,0.08)]'
    )}>
      {/* Full Player Content */}
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
        {/* Episode info + controls */}
        <div className="flex items-start gap-3">
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onCollapse}
              aria-label="플레이어 축소"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xl">🎙️</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{episode.title}</p>
            {episode.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {episode.description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={close}
            aria-label="플레이어 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Seek bar */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            step={0.1}
            onChange={handleSeek}
            className="w-full h-1.5 appearance-none rounded-full bg-border cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-primary
              [&::-webkit-slider-track]:rounded-full"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--border)) ${progress}%)`,
            }}
            aria-label="재생 위치"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          {/* Skip back */}
          <button
            onClick={() => skipBackward(15)}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-accent transition-colors active:scale-90"
            aria-label="15초 뒤로"
          >
            <SkipBack className="h-5 w-5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground font-mono">15</span>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={cn(
              'flex items-center justify-center w-14 h-14 rounded-full',
              'bg-primary text-primary-foreground shadow-md',
              'hover:bg-primary/90 active:scale-95 transition-all',
              'disabled:opacity-70'
            )}
            aria-label={isPlaying ? '일시정지' : '재생'}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-6 w-6" fill="currentColor" />
            ) : (
              <Play className="h-6 w-6" fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skipForward(15)}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-accent transition-colors active:scale-90"
            aria-label="15초 앞으로"
          >
            <SkipForward className="h-5 w-5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground font-mono">15</span>
          </button>
        </div>

        {/* Playback speed + Volume */}
        <div className="flex items-center justify-between gap-4">
          {/* Playback rate */}
          <div className="flex items-center gap-1">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                  playbackRate === rate
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                aria-label={`재생 속도 ${rate}x`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 min-w-[100px]">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={volume > 0 ? '음소거' : '음소거 해제'}
            >
              {volume > 0 ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolume}
              className="flex-1 h-1 appearance-none rounded-full bg-border cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-foreground"
              style={{
                background: `linear-gradient(to right, hsl(var(--foreground)) ${volume * 100}%, hsl(var(--border)) ${volume * 100}%)`,
              }}
              aria-label="볼륨"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
