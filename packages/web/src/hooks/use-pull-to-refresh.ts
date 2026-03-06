'use client';

import {useCallback, useEffect, useRef} from 'react';
import {useRouter} from 'next/navigation';

const THRESHOLD = 70;
const MAX_PULL = 120;
const RESISTANCE = 0.45;

type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing';

export function usePullToRefresh(containerRef: React.RefObject<HTMLDivElement | null>) {
  const router = useRouter();
  const startY = useRef(0);
  const pullDistance = useRef(0);
  const state = useRef<PullState>('idle');
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLDivElement | null>(null);

  const setIndicatorRef = useCallback((el: HTMLDivElement | null) => {
    indicatorRef.current = el;
  }, []);

  const setIconRef = useCallback((el: HTMLDivElement | null) => {
    iconRef.current = el;
  }, []);

  // Direct DOM updates (no re-renders during gesture)
  const applyTransform = useCallback((distance: number, animated: boolean) => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const icon = iconRef.current;
    if (!container) return;

    const transition = animated ? 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)' : 'none';
    container.style.transition = transition;
    container.style.transform = distance > 0 ? `translateY(${distance}px)` : '';

    if (indicator) {
      indicator.style.transition = transition;
      indicator.style.transform = `translateY(${distance > 0 ? distance : 0}px)`;
      indicator.style.opacity = distance > 10 ? '1' : '0';
    }

    if (icon) {
      const progress = Math.min(distance / THRESHOLD, 1);
      const rotation = state.current === 'refreshing' ? 0 : progress * 180;
      icon.style.transform = `rotate(${rotation}deg)`;
    }
  }, [containerRef]);

  const updateIconState = useCallback((newState: PullState) => {
    const icon = iconRef.current;
    const indicator = indicatorRef.current;
    if (!icon || !indicator) return;

    // Toggle CSS classes for icon
    const circle = indicator.querySelector('[data-circle]') as HTMLElement | null;

    if (newState === 'refreshing') {
      icon.classList.add('animate-spin');
      icon.style.transform = '';
      circle?.classList.add('border-primary');
    } else {
      icon.classList.remove('animate-spin');
      if (newState === 'ready') {
        circle?.classList.add('border-primary');
      } else {
        circle?.classList.remove('border-primary');
      }
    }
  }, []);

  useEffect(() => {
    let isTouching = false;

    function isScrolledToTop(): boolean {
      // Check both window and potential scroll containers
      if (window.scrollY > 1) return false;
      // Check if the touch started on a scrollable child that isn't at top
      return true;
    }

    function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollTop > 0) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }

    function onTouchStart(e: TouchEvent) {
      if (state.current === 'refreshing') return;
      if (!isScrolledToTop()) return;

      // Check if touch target is inside a scrolled container
      const target = e.target as HTMLElement;
      if (findScrollableParent(target)) return;

      startY.current = e.touches[0]!.clientY;
      pullDistance.current = 0;
      isTouching = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isTouching || state.current === 'refreshing') return;

      const diff = e.touches[0]!.clientY - startY.current;

      if (diff <= 0) {
        if (pullDistance.current > 0) {
          pullDistance.current = 0;
          state.current = 'idle';
          applyTransform(0, false);
          updateIconState('idle');
        }
        return;
      }

      // Prevent native scroll/bounce while pulling
      if (window.scrollY <= 0) {
        e.preventDefault();
      }

      const distance = Math.min(diff * RESISTANCE, MAX_PULL);
      pullDistance.current = distance;

      const newState = distance >= THRESHOLD ? 'ready' : 'pulling';
      if (state.current !== newState) {
        state.current = newState;
        updateIconState(newState);
      }

      applyTransform(distance, false);
    }

    function onTouchEnd() {
      if (!isTouching) return;
      isTouching = false;

      if (state.current === 'ready') {
        state.current = 'refreshing';
        updateIconState('refreshing');
        // Snap to a smaller position while refreshing
        applyTransform(THRESHOLD * 0.6, true);

        router.refresh();
        setTimeout(() => {
          state.current = 'idle';
          pullDistance.current = 0;
          updateIconState('idle');
          applyTransform(0, true);
        }, 1000);
      } else {
        state.current = 'idle';
        pullDistance.current = 0;
        updateIconState('idle');
        applyTransform(0, true);
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyTransform, updateIconState, router]);

  return { setIndicatorRef, setIconRef };
}
