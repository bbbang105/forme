'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {calendarEvents, db} from '@forme/shared';
import {and, desc, eq, gte, lte, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function expandRecurringEvents(
  events: (typeof calendarEvents.$inferSelect)[],
  rangeStart: string,
  rangeEnd: string
): (typeof calendarEvents.$inferSelect & { _originalId?: string; _instanceDate?: string })[] {
  const result: (typeof calendarEvents.$inferSelect & { _originalId?: string; _instanceDate?: string })[] = [];

  for (const event of events) {
    if (!event.recurrenceType) {
      result.push(event);
      continue;
    }

    const excluded = new Set(event.excludedDates ?? []);
    const days = event.recurrenceDays ?? [];
    if (days.length === 0) {
      result.push(event);
      continue;
    }

    const eventStartDate = new Date(event.startDate + 'T00:00:00');
    const rStart = new Date(rangeStart + 'T00:00:00');
    const effectiveEnd = event.recurrenceEndDate
      ? new Date(event.recurrenceEndDate + 'T00:00:00')
      : new Date(rangeEnd + 'T00:00:00');
    const rEnd = new Date(Math.min(effectiveEnd.getTime(), new Date(rangeEnd + 'T00:00:00').getTime()));

    const iterStart = new Date(Math.max(rStart.getTime(), eventStartDate.getTime()));
    const weekStart = new Date(iterStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const current = new Date(weekStart);
    while (current <= rEnd) {
      for (const dayOfWeek of days) {
        const instanceDate = new Date(current);
        instanceDate.setDate(instanceDate.getDate() + dayOfWeek);
        const dateStr = instanceDate.toISOString().split('T')[0];

        if (instanceDate < eventStartDate || instanceDate > rEnd || instanceDate < rStart) continue;
        if (excluded.has(dateStr)) continue;

        if (event.recurrenceType === 'biweekly') {
          const diffMs = instanceDate.getTime() - eventStartDate.getTime();
          const diffWeeks = Math.floor(diffMs / (7 * 86400000));
          if (diffWeeks % 2 !== 0) continue;
        }

        result.push({
          ...event,
          id: `${event.id}_${dateStr}`,
          startDate: dateStr,
          endDate: dateStr,
          _originalId: event.id,
          _instanceDate: dateStr,
        });
      }
      current.setDate(current.getDate() + 7);
    }
  }

  return result;
}

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
    const rangeStart = fmt(paddedStart);
    const rangeEnd = fmt(paddedEnd);

    const rows = await traceQuery('calendar.events.list', () =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, user.id),
            lte(calendarEvents.startDate, rangeEnd),
            gte(calendarEvents.endDate, rangeStart),
          )
        )
        .orderBy(calendarEvents.startDate, desc(calendarEvents.id))
    );

    return expandRecurringEvents(rows, rangeStart, rangeEnd);
  }, { month });
}

export async function createCalendarEvent(data: {
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  color?: string;
  description?: string | null;
  location?: string | null;
  categoryId?: string | null;
  isCompleted?: boolean;
  recurrenceType?: string | null;
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: string | null;
}) {
  return traceAction('createCalendarEvent', async () => {
    const user = await getAuthUser();

    if (!data.title.trim()) throw new Error('제목을 입력해주세요');
    if (data.title.trim().length > 200) throw new Error('제목은 200자 이내여야 합니다');
    if (!DATE_REGEX.test(data.startDate) || !DATE_REGEX.test(data.endDate)) throw new Error('날짜 형식이 올바르지 않습니다');
    if (data.startDate > data.endDate) throw new Error('종료일은 시작일 이후여야 합니다');
    if (data.color && !HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상을 선택해주세요');
    if (data.description && data.description.length > 2000) throw new Error('설명은 2000자 이내여야 합니다');
    if (data.startTime != null && !TIME_REGEX.test(data.startTime)) throw new Error('시작 시간 형식이 올바르지 않습니다.');
    if (data.endTime != null && !TIME_REGEX.test(data.endTime)) throw new Error('종료 시간 형식이 올바르지 않습니다.');
    if (data.location && data.location.length > 200) throw new Error('장소는 200자 이하로 입력해주세요.');
    if (data.startTime && data.endTime && data.startDate === data.endDate && data.endTime < data.startTime) throw new Error('종료 시간은 시작 시간 이후여야 합니다.');
    if (data.recurrenceType && !['weekly', 'biweekly'].includes(data.recurrenceType)) throw new Error('반복 유형은 weekly 또는 biweekly만 가능합니다');
    if (data.recurrenceType && (!data.recurrenceDays || data.recurrenceDays.length === 0)) throw new Error('반복 요일을 선택해주세요');
    if (data.recurrenceDays && data.recurrenceDays.some(d => d < 0 || d > 6)) throw new Error('요일은 0-6 범위여야 합니다');
    if (data.recurrenceEndDate && !DATE_REGEX.test(data.recurrenceEndDate)) throw new Error('반복 종료일 형식이 올바르지 않습니다');
    if (data.recurrenceEndDate && data.recurrenceEndDate < data.startDate) throw new Error('반복 종료일은 시작일 이후여야 합니다');

    const [row] = await traceQuery('calendar.events.create', () =>
      db
        .insert(calendarEvents)
        .values({
          userId: user.id,
          title: data.title.trim(),
          startDate: data.startDate,
          endDate: data.endDate,
          startTime: data.startTime || null,
          endTime: data.endTime || null,
          color: data.color || '#3b82f6',
          description: data.description?.trim() || null,
          location: data.location?.trim() || null,
          categoryId: data.categoryId || null,
          isCompleted: data.isCompleted ?? false,
          recurrenceType: data.recurrenceType || null,
          recurrenceDays: data.recurrenceDays || null,
          recurrenceEndDate: data.recurrenceEndDate || null,
          excludedDates: null,
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
    startTime?: string | null;
    endTime?: string | null;
    color?: string;
    description?: string | null;
    location?: string | null;
    categoryId?: string | null;
    isCompleted?: boolean;
    recurrenceType?: string | null;
    recurrenceDays?: number[] | null;
    recurrenceEndDate?: string | null;
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
    if (data.startTime !== undefined && data.startTime != null && !TIME_REGEX.test(data.startTime)) throw new Error('시작 시간 형식이 올바르지 않습니다.');
    if (data.endTime !== undefined && data.endTime != null && !TIME_REGEX.test(data.endTime)) throw new Error('종료 시간 형식이 올바르지 않습니다.');
    if (data.location && data.location.length > 200) throw new Error('장소는 200자 이하로 입력해주세요.');
    if (data.startTime !== undefined && data.endTime !== undefined && data.startTime && data.endTime && data.endTime < data.startTime) throw new Error('종료 시간은 시작 시간 이후여야 합니다.');
    if (data.recurrenceType !== undefined && data.recurrenceType && !['weekly', 'biweekly'].includes(data.recurrenceType)) throw new Error('반복 유형은 weekly 또는 biweekly만 가능합니다');
    if (data.recurrenceDays !== undefined && data.recurrenceDays && data.recurrenceDays.some(d => d < 0 || d > 6)) throw new Error('요일은 0-6 범위여야 합니다');
    if (data.recurrenceEndDate !== undefined && data.recurrenceEndDate && !DATE_REGEX.test(data.recurrenceEndDate)) throw new Error('반복 종료일 형식이 올바르지 않습니다');

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
    if (data.startTime !== undefined) updates.startTime = data.startTime || null;
    if (data.endTime !== undefined) updates.endTime = data.endTime || null;
    if (data.location !== undefined) updates.location = data.location?.trim() || null;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId || null;
    if (data.isCompleted !== undefined) updates.isCompleted = data.isCompleted;
    if (data.recurrenceType !== undefined) updates.recurrenceType = data.recurrenceType || null;
    if (data.recurrenceDays !== undefined) updates.recurrenceDays = data.recurrenceDays || null;
    if (data.recurrenceEndDate !== undefined) updates.recurrenceEndDate = data.recurrenceEndDate || null;

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

export async function toggleCalendarEvent(id: string) {
  return traceAction('toggleCalendarEvent', async () => {
    const user = await getAuthUser();
    const [toggled] = await traceQuery('toggle_calendar_event', () =>
      db.update(calendarEvents)
        .set({ isCompleted: sql`NOT ${calendarEvents.isCompleted}`, updatedAt: new Date() })
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, user.id)))
        .returning()
    );
    if (!toggled) throw new Error('일정을 찾을 수 없습니다.');
    revalidatePath('/calendar');
    return toggled;
  });
}

export async function excludeRecurringDate(eventId: string, dateStr: string) {
  return traceAction('excludeRecurringDate', async () => {
    const user = await getAuthUser();
    if (!DATE_REGEX.test(dateStr)) throw new Error('날짜 형식이 올바르지 않습니다');

    const [event] = await db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)));
    if (!event) throw new Error('일정을 찾을 수 없습니다');

    const excluded = event.excludedDates ?? [];
    if (!excluded.includes(dateStr)) {
      excluded.push(dateStr);
    }

    await traceQuery('calendar.events.excludeDate', () =>
      db.update(calendarEvents)
        .set({ excludedDates: excluded, updatedAt: new Date() })
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );

    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { eventId, dateStr });
}

export async function deleteRecurringAfter(eventId: string, dateStr: string) {
  return traceAction('deleteRecurringAfter', async () => {
    const user = await getAuthUser();
    if (!DATE_REGEX.test(dateStr)) throw new Error('날짜 형식이 올바르지 않습니다');

    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const newEndDate = d.toISOString().split('T')[0];

    const [event] = await db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)));
    if (!event) throw new Error('일정을 찾을 수 없습니다');

    if (newEndDate < event.startDate) {
      await traceQuery('calendar.events.delete', () =>
        db.delete(calendarEvents)
          .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
      );
    } else {
      await traceQuery('calendar.events.updateEndDate', () =>
        db.update(calendarEvents)
          .set({ recurrenceEndDate: newEndDate, updatedAt: new Date() })
          .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
      );
    }

    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { eventId, dateStr });
}
