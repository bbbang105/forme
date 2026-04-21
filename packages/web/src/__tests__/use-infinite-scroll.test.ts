import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useInfiniteScroll} from '@/hooks/use-infinite-scroll';

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

interface FakeObserver {
  callback: IOCallback;
  options: IntersectionObserverInit | undefined;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean) => void;
}

const observers: FakeObserver[] = [];

beforeEach(() => {
  observers.length = 0;
  const FakeIO = vi.fn(function (
    this: unknown,
    callback: IOCallback,
    options?: IntersectionObserverInit,
  ) {
    const instance: FakeObserver = {
      callback,
      options,
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      trigger(isIntersecting: boolean) {
        callback([{isIntersecting} as IntersectionObserverEntry]);
      },
    };
    observers.push(instance);
    return instance as unknown as IntersectionObserver;
  }) as unknown as typeof IntersectionObserver;
  vi.stubGlobal('IntersectionObserver', FakeIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Render helper — pre-attaches a sentinel DOM node to the ref via the
 * `ref` callback pattern so the effect observes it on first run.
 */
function renderWithSentinel(
  props: Parameters<typeof useInfiniteScroll>[0] & {sentinel?: HTMLDivElement},
) {
  const sentinel = props.sentinel ?? document.createElement('div');
  const hookResult = renderHook(
    (p: Parameters<typeof useInfiniteScroll>[0]) => {
      const h = useInfiniteScroll(p);
      // Assign the sentinel synchronously during render so the effect
      // (run after render) sees it.
      h.sentinelRef.current = sentinel;
      return h;
    },
    {initialProps: props},
  );
  return {...hookResult, sentinel};
}

describe('useInfiniteScroll', () => {
  it('creates an observer with the given rootMargin and observes the sentinel', () => {
    const {sentinel, unmount} = renderWithSentinel({
      hasMore: true,
      loading: false,
      onLoadMore: vi.fn(),
      rootMargin: '123px',
    });

    expect(observers.length).toBe(1);
    const io = observers[0]!;
    expect(io.options?.rootMargin).toBe('123px');
    expect(io.observe).toHaveBeenCalledWith(sentinel);

    unmount();
    expect(io.disconnect).toHaveBeenCalled();
  });

  it('invokes onLoadMore when sentinel becomes intersecting', () => {
    const onLoadMore = vi.fn();
    renderWithSentinel({hasMore: true, loading: false, onLoadMore});

    expect(observers.length).toBe(1);
    const io = observers[0]!;

    act(() => io.trigger(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // Non-intersecting is a no-op.
    act(() => io.trigger(false));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('ignores intersect events while loading', () => {
    const onLoadMore = vi.fn();
    renderWithSentinel({hasMore: true, loading: true, onLoadMore});

    expect(observers.length).toBe(1);
    const io = observers[0]!;
    act(() => io.trigger(true));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('skips observer setup when disabled or hasMore=false', () => {
    renderWithSentinel({
      hasMore: false,
      loading: false,
      onLoadMore: vi.fn(),
    });
    expect(observers.length).toBe(0);

    renderWithSentinel({
      hasMore: true,
      loading: false,
      disabled: true,
      onLoadMore: vi.fn(),
    });
    expect(observers.length).toBe(0);
  });

  it('reads the latest onLoadMore callback without re-creating the observer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const {rerender} = renderWithSentinel({
      hasMore: true,
      loading: false,
      onLoadMore: first,
    });

    expect(observers.length).toBe(1);
    const observerCountBefore = observers.length;

    rerender({hasMore: true, loading: false, onLoadMore: second});

    // Same observer instance — the deps did not change.
    expect(observers.length).toBe(observerCountBefore);

    act(() => observers[0]!.trigger(true));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
