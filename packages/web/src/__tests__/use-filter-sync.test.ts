import {renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const pushMock = vi.fn();
const currentSearchRef: {value: string} = {value: ''};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(currentSearchRef.value),
}));

import {useFilterSync} from '@/hooks/use-filter-sync';

beforeEach(() => {
  pushMock.mockClear();
  currentSearchRef.value = '';
});

describe('useFilterSync', () => {
  it('sets new keys and pushes base path with query string', () => {
    const {result} = renderHook(() => useFilterSync({basePath: '/feed'}));

    result.current.updateFilter({status: 'read', category: 'AI'});

    expect(pushMock).toHaveBeenCalledTimes(1);
    const [url] = pushMock.mock.calls[0]!;
    const parsed = new URL(`http://x${url as string}`);
    expect(parsed.pathname).toBe('/feed');
    expect(parsed.searchParams.get('status')).toBe('read');
    expect(parsed.searchParams.get('category')).toBe('AI');
  });

  it('deletes keys when patch value is null / undefined / empty string', () => {
    currentSearchRef.value = 'status=read&search=hello&tag=ai';

    const {result} = renderHook(() => useFilterSync({basePath: '/youtube'}));

    result.current.updateFilter({search: null, tag: undefined, status: ''});

    const [url] = pushMock.mock.calls[0]!;
    const parsed = new URL(`http://x${url as string}`);
    expect(parsed.searchParams.has('search')).toBe(false);
    expect(parsed.searchParams.has('tag')).toBe(false);
    expect(parsed.searchParams.has('status')).toBe(false);
    expect(parsed.pathname).toBe('/youtube');
  });

  it('preserves keys not present in the patch', () => {
    currentSearchRef.value = 'status=read&category=DEV';

    const {result} = renderHook(() => useFilterSync({basePath: '/feed'}));

    result.current.updateFilter({search: 'hello'});

    const [url] = pushMock.mock.calls[0]!;
    const parsed = new URL(`http://x${url as string}`);
    expect(parsed.searchParams.get('status')).toBe('read');
    expect(parsed.searchParams.get('category')).toBe('DEV');
    expect(parsed.searchParams.get('search')).toBe('hello');
  });

  it('uses {scroll: false} when preserveScroll is set', () => {
    const {result} = renderHook(() =>
      useFilterSync({basePath: '/feed', preserveScroll: true}),
    );

    result.current.updateFilter({status: 'bookmarked'});

    expect(pushMock).toHaveBeenCalledTimes(1);
    const call = pushMock.mock.calls[0]!;
    expect(call[1]).toEqual({scroll: false});
  });

  it('emits bare base path when all params are cleared', () => {
    currentSearchRef.value = 'status=read';
    const {result} = renderHook(() => useFilterSync({basePath: '/feed'}));

    result.current.updateFilter({status: null});
    const [url] = pushMock.mock.calls[0]!;
    expect(url).toBe('/feed');
  });
});
