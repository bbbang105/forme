'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';

interface UsePullToRefreshOptions {
  threshold?: number;
  maxPull?: number;
}

type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing';

export function usePullToRefresh({
  threshold = 80,
  maxPull = 130,
}: UsePullToRefreshOptions = {}) {
  const router = useRouter();
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const currentY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Only activate when scrolled to very top
      if (window.scrollY > 0) return;
      if (pullState === 'refreshing') return;

      startY.current = e.touches[0].clientY;
      currentY.current = e.touches[0].clientY;
      pulling.current = true;
    },
    [pullState],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current) return;
      if (pullState === 'refreshing') return;

      currentY.current = e.touches[0].clientY;
      const diff = currentY.current - startY.current;

      // Only pull down, not up
      if (diff <= 0) {
        setPullDistance(0);
        setPullState('idle');
        return;
      }

      // Prevent native scroll while pulling
      if (window.scrollY === 0 && diff > 0) {
        e.preventDefault();
      }

      // Diminishing returns for distance (rubber band feel)
      const distance = Math.min(diff * 0.5, maxPull);
      setPullDistance(distance);
      setPullState(distance >= threshold ? 'ready' : 'pulling');
    },
    [pullState, threshold, maxPull],
  );

  const handleTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullState === 'ready') {
      setPullState('refreshing');
      setPullDistance(threshold * 0.6);

      // Refresh and reset after a short delay
      router.refresh();
      setTimeout(() => {
        setPullState('idle');
        setPullDistance(0);
      }, 800);
    } else {
      setPullState('idle');
      setPullDistance(0);
    }
  }, [pullState, threshold, router]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullState, pullDistance };
}
