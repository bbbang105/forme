'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {db, youtubeItems} from '@forme/shared';
import {and, desc, eq} from 'drizzle-orm';

export async function getRecentYoutubeItems(limit = 5) {
  return traceAction('getRecentYoutubeItems', async () => {
    const user = await getAuthUser();

    const safeLimit = Math.min(Math.max(1, limit), 20);

    return traceQuery('youtube.items.recent', () =>
      db
        .select({
          id: youtubeItems.id,
          title: youtubeItems.title,
          channelName: youtubeItems.channelName,
          thumbnailUrl: youtubeItems.thumbnailUrl,
        })
        .from(youtubeItems)
        .where(and(eq(youtubeItems.userId, user.id), eq(youtubeItems.status, 'summarized')))
        .orderBy(desc(youtubeItems.summarizedAt))
        .limit(safeLimit)
    );
  }, { limit });
}
