'use server';

import {createClient} from '@/lib/supabase/server';
import {db, todos} from '@forme/shared';
import {and, asc, eq, gte, lte, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

export async function getTodosByDate(date: string) {
  const user = await requireAuth();
  if (!DATE_REGEX.test(date)) throw new Error('Invalid date format');

  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, user.id),
        eq(todos.date, date),
      )
    )
    .orderBy(asc(todos.sortOrder), asc(todos.createdAt));

  return rows;
}

export async function getTodosByDateRange(startDate: string, endDate: string) {
  const user = await requireAuth();
  if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) throw new Error('Invalid date format');

  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, user.id),
        gte(todos.date, startDate),
        lte(todos.date, endDate),
      )
    )
    .orderBy(asc(todos.date), asc(todos.sortOrder), asc(todos.createdAt));

  return rows;
}

export async function createTodo(data: {
  date: string;
  content: string;
}) {
  const user = await requireAuth();

  if (!DATE_REGEX.test(data.date)) throw new Error('Invalid date format');
  if (!data.content.trim()) throw new Error('내용을 입력해주세요');
  if (data.content.trim().length > 1000) throw new Error('내용은 1000자 이내여야 합니다');

  // Get max sort order for the date
  const [maxRow] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${todos.sortOrder}), -1)` })
    .from(todos)
    .where(
      and(
        eq(todos.userId, user.id),
        eq(todos.date, data.date),
      )
    );

  const [row] = await db
    .insert(todos)
    .values({
      userId: user.id,
      date: data.date,
      content: data.content.trim(),
      sortOrder: (maxRow?.maxOrder ?? -1) + 1,
    })
    .returning();

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return row;
}

export async function updateTodo(
  id: string,
  data: {
    content?: string;
    isCompleted?: boolean;
    sortOrder?: number;
  }
) {
  const user = await requireAuth();

  if (data.content !== undefined && !data.content.trim()) throw new Error('내용을 입력해주세요');
  if (data.content !== undefined && data.content.trim().length > 1000) throw new Error('내용은 1000자 이내여야 합니다');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.content !== undefined) updates.content = data.content.trim();
  if (data.isCompleted !== undefined) updates.isCompleted = data.isCompleted;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;

  const [row] = await db
    .update(todos)
    .set(updates)
    .where(
      and(
        eq(todos.id, id),
        eq(todos.userId, user.id),
      )
    )
    .returning();

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return row;
}

export async function deleteTodo(id: string) {
  const user = await requireAuth();

  await db
    .delete(todos)
    .where(
      and(
        eq(todos.id, id),
        eq(todos.userId, user.id),
      )
    );

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
}

export async function toggleTodo(id: string) {
  const user = await requireAuth();

  const [row] = await db
    .update(todos)
    .set({
      isCompleted: sql`NOT ${todos.isCompleted}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(todos.id, id),
        eq(todos.userId, user.id),
      )
    )
    .returning();

  if (!row) throw new Error('Todo not found');

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return row;
}
