import {useCallback, useEffect, useRef} from 'react';

interface UseSwipeActionOptions {
  /** Minimum distance (px) to trigger an action */
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Swipe gesture hook for list items.
 * Returns touch handlers + translateX ref for direct DOM manipulation.
 *
 * - Right swipe → onSwipeRight (e.g. mark as read)
 * - Left swipe → onSwipeLeft (e.g. delete)
 */
export function useSwipeAction({
  threshold = 80,
  onSwipeLeft,
  onSwipeRight,
}: UseSwipeActionOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const locked = useRef(false); // true = horizontal swipe confirmed
  const swipeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs to avoid stale closures without requiring re-registration
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  useEffect(() => { onSwipeLeftRef.current = onSwipeLeft; }, [onSwipeLeft]);
  useEffect(() => { onSwipeRightRef.current = onSwipeRight; }, [onSwipeRight]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (swipeTimeout.current !== null) {
        clearTimeout(swipeTimeout.current);
        swipeTimeout.current = null;
      }
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentX.current = 0;
    swiping.current = false;
    locked.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // First significant move — decide horizontal vs vertical
    if (!locked.current && !swiping.current) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll — bail out
        return;
      }
      if (Math.abs(dx) > 10) {
        locked.current = true;
        swiping.current = true;
      }
    }

    if (!locked.current) return;

    // Dampen the swipe beyond threshold
    const maxSwipe = threshold * 1.5;
    const clamped = Math.max(-maxSwipe, Math.min(maxSwipe, dx));
    currentX.current = clamped;

    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${clamped}px)`;
      containerRef.current.style.transition = 'none';
    }
  }, [threshold]);

  const onTouchEnd = useCallback(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    el.style.transition = 'transform 200ms ease-out';

    if (swiping.current && Math.abs(currentX.current) >= threshold) {
      // Animate out slightly then snap back
      const direction = currentX.current > 0 ? 1 : -1;
      el.style.transform = `translateX(${direction * (threshold + 20)}px)`;

      if (swipeTimeout.current !== null) clearTimeout(swipeTimeout.current);
      swipeTimeout.current = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.transition = 'transform 200ms ease-out';
          containerRef.current.style.transform = 'translateX(0)';
        }
        if (direction > 0) onSwipeRightRef.current?.();
        else onSwipeLeftRef.current?.();
        swipeTimeout.current = null;
      }, 150);
    } else {
      el.style.transform = 'translateX(0)';
    }

    swiping.current = false;
    locked.current = false;
    currentX.current = 0;
  }, [threshold]);

  return {
    containerRef,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
