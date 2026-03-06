'use client';

import {usePullToRefresh} from '@/hooks/use-pull-to-refresh';
import {RefreshCw} from 'lucide-react';
import {cn} from '@/lib/utils';

export function PullToRefresh() {
  const { pullState, pullDistance } = usePullToRefresh();

  if (pullState === 'idle' && pullDistance === 0) return null;

  const progress = Math.min(pullDistance / 80, 1);
  const rotation = pullState === 'refreshing' ? 0 : progress * 270;
  const scale = 0.5 + progress * 0.5;
  const opacity = Math.min(progress * 1.5, 1);

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        top: `calc(env(safe-area-inset-top) + 3.5rem)`,
        transform: `translateY(${pullDistance - 20}px)`,
        transition:
          pullState === 'idle' ? 'transform 0.3s ease, opacity 0.3s ease' : 'none',
        opacity,
      }}
    >
      <div
        className={cn(
          'flex items-center justify-center',
          'h-10 w-10 rounded-full',
          'bg-background shadow-lg border border-border',
          pullState === 'ready' && 'border-primary',
          pullState === 'refreshing' && 'border-primary',
        )}
        style={{
          transform: `scale(${scale})`,
          transition:
            pullState === 'idle' ? 'transform 0.3s ease' : 'transform 0.1s ease-out',
        }}
      >
        <RefreshCw
          className={cn(
            'h-4.5 w-4.5 text-muted-foreground transition-colors',
            pullState === 'ready' && 'text-primary',
            pullState === 'refreshing' && 'text-primary animate-spin',
          )}
          style={{
            transform:
              pullState === 'refreshing' ? 'none' : `rotate(${rotation}deg)`,
          }}
        />
      </div>
    </div>
  );
}
