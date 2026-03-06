'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {DATE_REGEX, UUID_REGEX} from '@/lib/validators';
import {db, todos} from '@forme/shared';
import {and, asc, eq, gte, lte, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

export async function getTodosByDate(date: string) {
  return traceAction('getTodosByDate', async () => {
    const user = await getAuthUser();
    if (!DATE_REGEX.test(date)) throw new Error('잘못된 날짜 형식입니다');

    const rows = await traceQuery('todos.list', () =>
      db
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, user.id),
            eq(todos.date, date),
          )
        )
        .orderBy(asc(todos.sortOrder), asc(todos.createdAt))
    );

    return rows;
  }, { date });
}

export async function getTodosByDateRange(startDate: string, endDate: string) {
  return traceAction('getTodosByDateRange', async () => {
    const user = await getAuthUser();
    if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) throw new Error('잘못된 날짜 형식입니다');

    const rows = await traceQuery('todos.list.range', () =>
      db
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, user.id),
            gte(todos.date, startDate),
            lte(todos.date, endDate),
          )
        )
        .orderBy(asc(todos.date), asc(todos.sortOrder), asc(todos.createdAt))
    );

    return rows;
  }, { startDate, endDate });
}

export async function createTodo(data: {
  date: string;
  content: string;
}) {
  return traceAction('createTodo', async () => {
    const user = await getAuthUser();

    if (!DATE_REGEX.test(data.date)) throw new Error('잘못된 날짜 형식입니다');
    if (!data.content.trim()) throw new Error('내용을 입력해주세요');
    if (data.content.trim().length > 1000) throw new Error('내용은 1000자 이내여야 합니다');

    // Get max sort order for the date
    const [maxRow] = await traceQuery('todos.max-sort-order', () =>
      db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${todos.sortOrder}), -1)` })
        .from(todos)
        .where(
          and(
            eq(todos.userId, user.id),
            eq(todos.date, data.date),
          )
        )
    );

    const [row] = await traceQuery('todos.create', () =>
      db
        .insert(todos)
        .values({
          userId: user.id,
          date: data.date,
          content: data.content.trim(),
          sortOrder: (maxRow?.maxOrder ?? -1) + 1,
        })
        .returning()
    );

    // New todo creation surfaces on the dashboard today's-todos widget
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    return row;
  }, { date: data.date });
}

export async function updateTodo(
  id: string,
  data: {
    content?: string;
    isCompleted?: boolean;
    sortOrder?: number;
  }
) {
  return traceAction('updateTodo', async () => {
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');
    const user = await getAuthUser();

    if (data.content !== undefined && !data.content.trim()) throw new Error('내용을 입력해주세요');
    if (data.content !== undefined && data.content.trim().length > 1000) throw new Error('내용은 1000자 이내여야 합니다');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.content !== undefined) updates.content = data.content.trim();
    if (data.isCompleted !== undefined) updates.isCompleted = data.isCompleted;
    if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;

    const [row] = await traceQuery('todos.update', () =>
      db
        .update(todos)
        .set(updates)
        .where(
          and(
            eq(todos.id, id),
            eq(todos.userId, user.id),
          )
        )
        .returning()
    );

    // Content/sort-order edit — only the calendar view needs refreshing
    revalidatePath('/calendar');
    return row;
  }, { id });
}

export async function deleteTodo(id: string) {
  return traceAction('deleteTodo', async () => {
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');
    const user = await getAuthUser();

    await traceQuery('todos.delete', () =>
      db
        .delete(todos)
        .where(
          and(
            eq(todos.id, id),
            eq(todos.userId, user.id),
          )
        )
    );

    // Deletion changes the dashboard today's-todos widget count
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { id });
}

export async function toggleTodo(id: string) {
  return traceAction('toggleTodo', async () => {
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');
    const user = await getAuthUser();

    const [row] = await traceQuery('todos.toggle', () =>
      db
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
        .returning()
    );

    if (!row) throw new Error('할 일을 찾을 수 없습니다');

    // Toggle is a completion state change — only the calendar view needs refreshing
    revalidatePath('/calendar');
    return row;
  }, { id });
}
