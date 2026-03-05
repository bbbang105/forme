'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {db, eventCategories} from '@forme/shared';
import {and, asc, eq} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_CATEGORIES = [
  { name: '업무', color: '#3b82f6', icon: '📋', sortOrder: 0 },
  { name: '개인', color: '#22c55e', icon: '👤', sortOrder: 1 },
  { name: '약속', color: '#f59e0b', icon: '🤝', sortOrder: 2 },
  { name: '공부', color: '#8b5cf6', icon: '📚', sortOrder: 3 },
];

export async function getCategories() {
  return traceAction('getCategories', async () => {
    const user = await getAuthUser();
    let categories = await traceQuery('select_categories', () =>
      db.select().from(eventCategories)
        .where(eq(eventCategories.userId, user.id))
        .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.createdAt))
    );

    if (categories.length === 0) {
      const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id }));
      categories = await traceQuery('insert_default_categories', () =>
        db.insert(eventCategories).values(rows).returning()
      );
    }

    return categories;
  });
}

export async function createCategory(data: { name: string; color: string; icon: string }) {
  return traceAction('createCategory', async () => {
    const user = await getAuthUser();

    const name = data.name.trim();
    if (!name || name.length > 50) throw new Error('카테고리 이름은 1~50자입니다.');
    if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');
    if (!data.icon || data.icon.length > 10) throw new Error('아이콘을 선택해주세요.');

    const existing = await traceQuery('count_categories', () =>
      db.select().from(eventCategories).where(eq(eventCategories.userId, user.id))
    );
    if (existing.length >= 8) throw new Error('카테고리는 최대 8개까지 생성할 수 있습니다.');

    const maxOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const [created] = await traceQuery('insert_category', () =>
      db.insert(eventCategories).values({
        userId: user.id,
        name,
        color: data.color,
        icon: data.icon,
        sortOrder: maxOrder + 1,
      }).returning()
    );

    revalidatePath('/calendar');
    return created;
  });
}

export async function updateCategory(id: string, data: { name?: string; color?: string; icon?: string; sortOrder?: number }) {
  return traceAction('updateCategory', async () => {
    const user = await getAuthUser();

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || name.length > 50) throw new Error('카테고리 이름은 1~50자입니다.');
      updates.name = name;
    }
    if (data.color !== undefined) {
      if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');
      updates.color = data.color;
    }
    if (data.icon !== undefined) {
      if (!data.icon || data.icon.length > 10) throw new Error('아이콘을 선택해주세요.');
      updates.icon = data.icon;
    }
    if (data.sortOrder !== undefined) {
      if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0 || data.sortOrder > 7) throw new Error('올바른 정렬 순서가 아닙니다.');
      updates.sortOrder = data.sortOrder;
    }

    if (Object.keys(updates).length === 0) return;

    const [updated] = await traceQuery('update_category', () =>
      db.update(eventCategories).set(updates)
        .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, user.id)))
        .returning()
    );

    revalidatePath('/calendar');
    return updated;
  });
}

export async function deleteCategory(id: string) {
  return traceAction('deleteCategory', async () => {
    const user = await getAuthUser();
    await traceQuery('delete_category', () =>
      db.delete(eventCategories)
        .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, user.id)))
    );
    revalidatePath('/calendar');
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reorderCategories(orderedIds: string[]) {
  return traceAction('reorderCategories', async () => {
    const user = await getAuthUser();

    if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > 8) throw new Error('올바른 카테고리 목록이 아닙니다.');
    if (orderedIds.some((id) => !UUID_REGEX.test(id))) throw new Error('올바른 카테고리 ID가 아닙니다.');

    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(eventCategories).set({ sortOrder: i })
          .where(and(eq(eventCategories.id, orderedIds[i]), eq(eventCategories.userId, user.id)));
      }
    });
    revalidatePath('/calendar');
  });
}
