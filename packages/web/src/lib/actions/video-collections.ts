'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {HEX_COLOR_REGEX, UUID_REGEX} from '@/lib/validators';
import {db, videoBookmarkCollections, videoItems} from '@forme/shared';
import {and, asc, eq, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

export async function getVideoCollections() {
  return traceAction('getVideoCollections', async () => {
    const user = await getAuthUser();
    return traceQuery('select_video_collections', () =>
      db.select().from(videoBookmarkCollections)
        .where(eq(videoBookmarkCollections.userId, user.id))
        .orderBy(asc(videoBookmarkCollections.sortOrder), asc(videoBookmarkCollections.createdAt))
    );
  });
}

export async function getVideoCollectionsWithCount() {
  return traceAction('getVideoCollectionsWithCount', async () => {
    const user = await getAuthUser();
    const collections = await traceQuery('select_video_collections', () =>
      db.select().from(videoBookmarkCollections)
        .where(eq(videoBookmarkCollections.userId, user.id))
        .orderBy(asc(videoBookmarkCollections.sortOrder), asc(videoBookmarkCollections.createdAt))
    );

    const counts = await traceQuery('count_per_video_collection', () =>
      db.select({
        collectionId: videoItems.collectionId,
        count: sql<number>`count(*)::int`,
      })
        .from(videoItems)
        .where(and(
          sql`${videoItems.collectionId} IS NOT NULL`,
          eq(videoItems.userId, user.id),
        ))
        .groupBy(videoItems.collectionId)
    );

    const countMap = new Map(counts.map((c) => [c.collectionId, c.count]));
    return collections.map((col) => ({
      ...col,
      count: countMap.get(col.id) ?? 0,
    }));
  });
}

export async function createVideoCollection(data: {name: string; color: string}) {
  return traceAction('createVideoCollection', async () => {
    const user = await getAuthUser();

    const name = data.name.trim();
    if (!name || name.length > 50) throw new Error('컬렉션 이름은 1~50자입니다.');
    if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');

    const existing = await traceQuery('count_video_collections', () =>
      db.select().from(videoBookmarkCollections).where(eq(videoBookmarkCollections.userId, user.id))
    );
    if (existing.length >= 10) throw new Error('컬렉션은 최대 10개까지 생성할 수 있습니다.');

    const maxOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const [created] = await traceQuery('insert_video_collection', () =>
      db.insert(videoBookmarkCollections).values({
        userId: user.id,
        name,
        color: data.color,
        sortOrder: maxOrder + 1,
      }).returning()
    );

    revalidatePath('/video');
    return created;
  });
}

export async function updateVideoCollection(id: string, data: {name?: string; color?: string}) {
  return traceAction('updateVideoCollection', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(id)) throw new Error('올바른 ID가 아닙니다.');

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || name.length > 50) throw new Error('컬렉션 이름은 1~50자입니다.');
      updates.name = name;
    }
    if (data.color !== undefined) {
      if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');
      updates.color = data.color;
    }

    if (Object.keys(updates).length === 0) return;

    const [updated] = await traceQuery('update_video_collection', () =>
      db.update(videoBookmarkCollections).set(updates)
        .where(and(eq(videoBookmarkCollections.id, id), eq(videoBookmarkCollections.userId, user.id)))
        .returning()
    );

    revalidatePath('/video');
    return updated;
  });
}

export async function deleteVideoCollection(id: string) {
  return traceAction('deleteVideoCollection', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(id)) throw new Error('올바른 ID가 아닙니다.');

    // collectionId를 null로 설정
    await traceQuery('clear_video_collection_refs', () =>
      db.update(videoItems).set({collectionId: null})
        .where(and(eq(videoItems.collectionId, id), eq(videoItems.userId, user.id)))
    );

    await traceQuery('delete_video_collection', () =>
      db.delete(videoBookmarkCollections)
        .where(and(eq(videoBookmarkCollections.id, id), eq(videoBookmarkCollections.userId, user.id)))
    );
    revalidatePath('/video');
  });
}

export async function reorderVideoCollections(orderedIds: string[]) {
  return traceAction('reorderVideoCollections', async () => {
    const user = await getAuthUser();
    if (orderedIds.length === 0) return;
    if (orderedIds.length > 10) throw new Error('최대 10개까지만 정렬할 수 있습니다.');
    if (orderedIds.some((id) => !UUID_REGEX.test(id))) throw new Error('올바른 ID가 아닙니다.');

    await Promise.all(
      orderedIds.map((id, index) =>
        traceQuery('update_video_sort_order', () =>
          db.update(videoBookmarkCollections)
            .set({sortOrder: index})
            .where(and(eq(videoBookmarkCollections.id, id), eq(videoBookmarkCollections.userId, user.id)))
        )
      )
    );
    revalidatePath('/video');
  });
}
