/**
 * Regression guard for SavedItemBase contract.
 *
 * Both FeedItemData and YoutubeItemData must remain assignable to
 * SavedItemBase so that shared UI primitives (InlineNote, pin toggle,
 * bookmark button, read/unread, saved view) continue to receive a uniform
 * subset of fields. If any of these fields drifts (renamed, removed,
 * re-typed to something incompatible) the `const _typecheck` assignments
 * below will fail typecheck in CI.
 */
import { describe, expect, it } from 'vitest';

import type { FeedItemData } from '@/components/features/feed/feed-card';
import type { YoutubeItemData } from '@/components/features/youtube/youtube-card';
import type { SavedItemBase } from '@/lib/types/saved-item';

describe('SavedItemBase — shared contract', () => {
  it('FeedItemData satisfies SavedItemBase', () => {
    const feed: FeedItemData = {
      id: 'feed-1',
      sourceId: 'src-1',
      title: 'Hello',
      description: null,
      thumbnailUrl: null,
      publishedAt: null,
      isRead: false,
      isBookmarked: false,
      note: null,
      pinnedAt: null,
      url: 'https://example.com',
      category: 'DEV',
      tags: null,
      collectedAt: '2026-04-21T00:00:00.000Z',
      sourceName: 'Example',
    };
    const base: SavedItemBase = feed;
    expect(base.id).toBe('feed-1');
    expect(base.sourceId).toBe('src-1');
    expect(base.pinnedAt).toBeNull();
  });

  it('YoutubeItemData satisfies SavedItemBase', () => {
    const yt: YoutubeItemData = {
      id: 'yt-1',
      sourceId: null,
      title: 'Video',
      description: null,
      thumbnailUrl: null,
      publishedAt: null,
      isRead: false,
      isBookmarked: false,
      note: null,
      pinnedAt: null,
      videoId: 'abc123',
      status: 'summarized',
      channelName: 'Channel',
      oneLiner: null,
      summarySource: null,
      keywords: null,
      duration: null,
    };
    const base: SavedItemBase = yt;
    expect(base.id).toBe('yt-1');
    expect(base.sourceId).toBeNull();
    expect(base.pinnedAt).toBeNull();
  });

  it('functions accepting SavedItemBase work with both concrete types', () => {
    function isPinned(item: SavedItemBase): boolean {
      return item.pinnedAt !== null;
    }

    const feed: FeedItemData = {
      id: 'feed-1',
      sourceId: 'src-1',
      title: 'Hello',
      description: null,
      thumbnailUrl: null,
      publishedAt: null,
      isRead: false,
      isBookmarked: false,
      note: null,
      pinnedAt: '2026-04-21T00:00:00.000Z',
      url: 'https://example.com',
      category: 'DEV',
      tags: null,
      collectedAt: '2026-04-21T00:00:00.000Z',
      sourceName: null,
    };
    const yt: YoutubeItemData = {
      id: 'yt-1',
      sourceId: null,
      title: 'Video',
      description: null,
      thumbnailUrl: null,
      publishedAt: null,
      isRead: false,
      isBookmarked: false,
      note: null,
      pinnedAt: null,
      videoId: 'abc123',
      status: 'summarized',
      channelName: 'Channel',
      oneLiner: null,
      summarySource: null,
      keywords: null,
      duration: null,
    };

    expect(isPinned(feed)).toBe(true);
    expect(isPinned(yt)).toBe(false);
  });
});
