'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {HEX_COLOR_REGEX, UUID_REGEX} from '@/lib/validators';
import {bookmarkCollections, curationItems, curationSources, db} from '@forme/shared';
import {and, asc, eq, isNull, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

export async function getCollections() {
  return traceAction('getCollections', async () => {
    const user = await getAuthUser();
    return traceQuery('select_collections', () =>
      db.select().from(bookmarkCollections)
        .where(eq(bookmarkCollections.userId, user.id))
        .orderBy(asc(bookmarkCollections.sortOrder), asc(bookmarkCollections.createdAt))
    );
  });
}

export async function getCollectionsWithCount() {
  return traceAction('getCollectionsWithCount', async () => {
    const user = await getAuthUser();
    const collections = await traceQuery('select_collections', () =>
      db.select().from(bookmarkCollections)
        .where(eq(bookmarkCollections.userId, user.id))
        .orderBy(asc(bookmarkCollections.sortOrder), asc(bookmarkCollections.createdAt))
    );

    const counts = await traceQuery('count_per_collection', () =>
      db.select({
        collectionId: curationItems.collectionId,
        count: sql<number>`count(*)::int`,
      })
        .from(curationItems)
        .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
        .where(and(
          sql`${curationItems.collectionId} IS NOT NULL`,
          eq(curationSources.userId, user.id),
          isNull(curationItems.deletedAt)
        ))
        .groupBy(curationItems.collectionId)
    );

    const countMap = new Map(counts.map((c) => [c.collectionId, c.count]));
    return collections.map((col) => ({
      ...col,
      count: countMap.get(col.id) ?? 0,
    }));
  });
}

export async function createCollection(data: { name: string; color: string }) {
  return traceAction('createCollection', async () => {
    const user = await getAuthUser();

    const name = data.name.trim();
    if (!name || name.length > 50) throw new Error('컬렉션 이름은 1~50자입니다.');
    if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');

    const existing = await traceQuery('count_collections', () =>
      db.select().from(bookmarkCollections).where(eq(bookmarkCollections.userId, user.id))
    );
    if (existing.length >= 10) throw new Error('컬렉션은 최대 10개까지 생성할 수 있습니다.');

    const maxOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const [created] = await traceQuery('insert_collection', () =>
      db.insert(bookmarkCollections).values({
        userId: user.id,
        name,
        color: data.color,
        sortOrder: maxOrder + 1,
      }).returning()
    );

    revalidatePath('/curation');
    return created;
  });
}

export async function updateCollection(id: string, data: { name?: string; color?: string }) {
  return traceAction('updateCollection', async () => {
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

    const [updated] = await traceQuery('update_collection', () =>
      db.update(bookmarkCollections).set(updates)
        .where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, user.id)))
        .returning()
    );

    revalidatePath('/curation');
    return updated;
  });
}

export async function deleteCollection(id: string) {
  return traceAction('deleteCollection', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(id)) throw new Error('올바른 ID가 아닙니다.');

    // collectionId가 set null이므로 아이템은 자동으로 미분류로 돌아감
    await traceQuery('delete_collection', () =>
      db.delete(bookmarkCollections)
        .where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, user.id)))
    );
    revalidatePath('/curation');
  });
}

export async function reorderCollections(orderedIds: string[]) {
  return traceAction('reorderCollections', async () => {
    const user = await getAuthUser();
    if (orderedIds.length === 0) return;
    if (orderedIds.length > 10) throw new Error('최대 10개까지만 정렬할 수 있습니다.');
    if (orderedIds.some((id) => !UUID_REGEX.test(id))) throw new Error('올바른 ID가 아닙니다.');

    // Bulk update sortOrder
    await Promise.all(
      orderedIds.map((id, index) =>
        traceQuery('update_sort_order', () =>
          db.update(bookmarkCollections)
            .set({ sortOrder: index })
            .where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, user.id)))
        )
      )
    );
    revalidatePath('/curation');
  });
}

export async function assignCollection(itemId: string, collectionId: string | null) {
  return traceAction('assignCollection', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(itemId)) throw new Error('올바른 아이템 ID가 아닙니다.');
    if (collectionId !== null && !UUID_REGEX.test(collectionId)) throw new Error('올바른 컬렉션 ID가 아닙니다.');

    // 컬렉션 소유권 검증
    if (collectionId !== null) {
      const [col] = await traceQuery('verify_collection_ownership', () =>
        db.select({ id: bookmarkCollections.id })
          .from(bookmarkCollections)
          .where(and(eq(bookmarkCollections.id, collectionId), eq(bookmarkCollections.userId, user.id)))
          .limit(1)
      );
      if (!col) throw new Error('컬렉션을 찾을 수 없습니다.');
    }

    // 컬렉션 지정 시 자동 북마크
    const updates: Record<string, unknown> = { collectionId };
    if (collectionId !== null) {
      updates.isBookmarked = true;
    }

    // ownership은 curationSources join으로 검증
    const [existing] = await traceQuery('verify_ownership', () =>
      db.select({ id: curationItems.id })
        .from(curationItems)
        .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
        .where(and(eq(curationItems.id, itemId), eq(curationSources.userId, user.id), isNull(curationItems.deletedAt)))
        .limit(1)
    );

    if (!existing) throw new Error('아이템을 찾을 수 없습니다.');

    await traceQuery('assign_collection', () =>
      db.update(curationItems).set(updates).where(eq(curationItems.id, itemId))
    );

    revalidatePath('/curation');
  });
}
