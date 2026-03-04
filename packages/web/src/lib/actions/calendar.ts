'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {calendarEvents, db} from '@forme/shared';
import {and, desc, eq, gte, lte} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export async function getCalendarEvents(month: string) {
  return traceAction('getCalendarEvents', async () => {
    const user = await getAuthUser();

    if (!MONTH_REGEX.test(month)) throw new Error('Invalid month format');

    const [year, m] = month.split('-').map(Number);
    const startDate = new Date(year, m - 1, 1);
    const endDate = new Date(year, m, 0);

    const paddedStart = new Date(startDate);
    paddedStart.setDate(paddedStart.getDate() - 7);
    const paddedEnd = new Date(endDate);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const rows = await traceQuery('calendar.events.list', () =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, user.id),
            lte(calendarEvents.startDate, fmt(paddedEnd)),
            gte(calendarEvents.endDate, fmt(paddedStart)),
          )
        )
        .orderBy(calendarEvents.startDate, desc(calendarEvents.id))
    );

    return rows;
  }, { month });
}

export async function createCalendarEvent(data: {
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description?: string;
}) {
  return traceAction('createCalendarEvent', async () => {
    const user = await getAuthUser();

    if (!data.title.trim()) throw new Error('제목을 입력해주세요');
    if (data.title.trim().length > 200) throw new Error('제목은 200자 이내여야 합니다');
    if (!DATE_REGEX.test(data.startDate) || !DATE_REGEX.test(data.endDate)) throw new Error('날짜 형식이 올바르지 않습니다');
    if (data.startDate > data.endDate) throw new Error('종료일은 시작일 이후여야 합니다');
    if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상을 선택해주세요');
    if (data.description && data.description.length > 2000) throw new Error('설명은 2000자 이내여야 합니다');

    const [row] = await traceQuery('calendar.events.create', () =>
      db
        .insert(calendarEvents)
        .values({
          userId: user.id,
          title: data.title.trim(),
          startDate: data.startDate,
          endDate: data.endDate,
          color: data.color,
          description: data.description?.trim() || null,
        })
        .returning()
    );

    // New event creation surfaces on the dashboard upcoming-events widget
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    return row;
  }, { title: data.title, startDate: data.startDate, endDate: data.endDate });
}

export async function updateCalendarEvent(
  id: string,
  data: {
    title?: string;
    startDate?: string;
    endDate?: string;
    color?: string;
    description?: string | null;
  }
) {
  return traceAction('updateCalendarEvent', async () => {
    const user = await getAuthUser();

    if (data.title !== undefined && !data.title.trim()) throw new Error('제목을 입력해주세요');
    if (data.title !== undefined && data.title.trim().length > 200) throw new Error('제목은 200자 이내여야 합니다');
    if (data.startDate !== undefined && !DATE_REGEX.test(data.startDate)) throw new Error('날짜 형식이 올바르지 않습니다');
    if (data.endDate !== undefined && !DATE_REGEX.test(data.endDate)) throw new Error('날짜 형식이 올바르지 않습니다');
    if (data.color !== undefined && !HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상을 선택해주세요');
    if (data.description && data.description.length > 2000) throw new Error('설명은 2000자 이내여야 합니다');

    // Validate date range if either date changes
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const [existing] = await traceQuery('calendar.events.get', () =>
        db
          .select({ startDate: calendarEvents.startDate, endDate: calendarEvents.endDate })
          .from(calendarEvents)
          .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, user.id)))
      );
      if (!existing) throw new Error('일정을 찾을 수 없습니다');
      const effectiveStart = data.startDate ?? existing.startDate;
      const effectiveEnd = data.endDate ?? existing.endDate;
      if (effectiveStart > effectiveEnd) throw new Error('종료일은 시작일 이후여야 합니다');
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updates.title = data.title.trim();
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.color !== undefined) updates.color = data.color;
    if (data.description !== undefined) updates.description = data.description?.trim() || null;

    const [row] = await traceQuery('calendar.events.update', () =>
      db
        .update(calendarEvents)
        .set(updates)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id),
          )
        )
        .returning()
    );

    // Content-only update — only the calendar view needs refreshing
    revalidatePath('/calendar');
    return row;
  }, { id });
}

export async function deleteCalendarEvent(id: string) {
  return traceAction('deleteCalendarEvent', async () => {
    const user = await getAuthUser();

    await traceQuery('calendar.events.delete', () =>
      db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id),
          )
        )
    );

    // Deletion changes the dashboard upcoming-events widget count
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { id });
}
