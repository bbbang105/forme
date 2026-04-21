'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {DATE_REGEX, HEX_COLOR_REGEX, TIME_REGEX, UUID_REGEX} from '@/lib/validators';
import {calendarEvents, db} from '@forme/shared';
import {and, desc, eq, lte, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/** 반복 종료일 미지정 시 시작일 + 1년 기본값 */
function defaultEndDate(startDate: string): string {
  const d = new Date(startDate + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
    const completed = new Set(event.completedDates ?? []);
    const days = event.recurrenceDays ?? [];
    if (days.length === 0) {
      result.push(event);
      continue;
    }

    // 로컬 날짜 포맷 (UTC 변환 방지 - KST 서버에서 toISOString()은 하루 밀림)
    const fmtLocal = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const eventStartDate = new Date(event.startDate + 'T12:00:00');
    const rStart = new Date(rangeStart + 'T12:00:00');
    const effectiveEnd = event.recurrenceEndDate
      ? new Date(event.recurrenceEndDate + 'T12:00:00')
      : new Date(rangeEnd + 'T12:00:00');
    const rEnd = new Date(Math.min(effectiveEnd.getTime(), new Date(rangeEnd + 'T12:00:00').getTime()));

    const iterStart = new Date(Math.max(rStart.getTime(), eventStartDate.getTime()));
    const weekStart = new Date(iterStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const current = new Date(weekStart);
    current.setHours(12, 0, 0, 0);
    while (current <= rEnd) {
      for (const dayOfWeek of days) {
        const instanceDate = new Date(current);
        instanceDate.setDate(instanceDate.getDate() + dayOfWeek);
        const dateStr = fmtLocal(instanceDate);

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
          isCompleted: completed.has(dateStr),
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

    const fmtLocal = (d: Date) => {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    };
    const rangeStart = fmtLocal(paddedStart);
    const rangeEnd = fmtLocal(paddedEnd);

    // 일반 이벤트: startDate ≤ rangeEnd AND endDate ≥ rangeStart
    // 반복 이벤트: startDate ≤ rangeEnd AND (recurrenceEndDate ≥ rangeStart OR recurrenceEndDate IS NULL)
    const rows = await traceQuery('calendar.events.list', () =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, user.id),
            lte(calendarEvents.startDate, rangeEnd),
            sql`(
              CASE
                WHEN ${calendarEvents.recurrenceType} IS NOT NULL
                THEN COALESCE(${calendarEvents.recurrenceEndDate}, '9999-12-31') >= ${rangeStart}
                ELSE ${calendarEvents.endDate} >= ${rangeStart}
              END
            )`,
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
          recurrenceEndDate: data.recurrenceType
            ? (data.recurrenceEndDate || defaultEndDate(data.startDate))
            : null,
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
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');

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
    if (data.recurrenceEndDate !== undefined) {
      const recType = data.recurrenceType ?? updates.recurrenceType;
      updates.recurrenceEndDate = recType
        ? (data.recurrenceEndDate || defaultEndDate(data.startDate ?? updates.startDate as string))
        : null;
    }

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
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');

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
    if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');
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

export async function toggleRecurringInstance(eventId: string, dateStr: string) {
  return traceAction('toggleRecurringInstance', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(eventId)) throw new Error('잘못된 ID입니다');
    if (!DATE_REGEX.test(dateStr)) throw new Error('날짜 형식이 올바르지 않습니다');

    const [event] = await traceQuery('calendar.events.get_for_toggle_instance', () =>
      db.select().from(calendarEvents)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );
    if (!event) throw new Error('일정을 찾을 수 없습니다');

    const existing = event.completedDates ?? [];
    const idx = existing.indexOf(dateStr);
    const completed = idx >= 0
      ? existing.filter((_, i) => i !== idx)
      : [...existing, dateStr];

    await traceQuery('calendar.events.toggleInstance', () =>
      db.update(calendarEvents)
        .set({ completedDates: completed, updatedAt: new Date() })
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );

    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { eventId, dateStr });
}

export async function excludeRecurringDate(eventId: string, dateStr: string) {
  return traceAction('excludeRecurringDate', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(eventId)) throw new Error('잘못된 ID입니다');
    if (!DATE_REGEX.test(dateStr)) throw new Error('날짜 형식이 올바르지 않습니다');

    const [event] = await traceQuery('calendar.events.get_for_exclude', () =>
      db.select().from(calendarEvents)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );
    if (!event) throw new Error('일정을 찾을 수 없습니다');

    // Build a new array instead of mutating the ORM-returned reference
    const existing = event.excludedDates ?? [];
    const excluded = existing.includes(dateStr) ? existing : [...existing, dateStr];

    await traceQuery('calendar.events.excludeDate', () =>
      db.update(calendarEvents)
        .set({ excludedDates: excluded, updatedAt: new Date() })
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );

    revalidatePath('/calendar');
    revalidatePath('/dashboard');
  }, { eventId, dateStr });
}

/**
 * 반복 일정의 개별 인스턴스만 수정 (Google Calendar "이 일정만 수정" 패턴)
 * 1) 부모 이벤트의 excludedDates에 해당 날짜 추가 (+ completedDates에서 제거)
 * 2) 수정된 내용으로 새로운 단독 이벤트 생성
 * 두 작업을 트랜잭션으로 묶어 원자성 보장
 */
export async function updateRecurringInstance(
  parentId: string,
  instanceDate: string,
  data: {
    title: string;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
    color?: string;
    description?: string | null;
    location?: string | null;
    categoryId?: string | null;
  }
) {
  return traceAction('updateRecurringInstance', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(parentId)) throw new Error('잘못된 ID입니다');
    if (!DATE_REGEX.test(instanceDate)) throw new Error('날짜 형식이 올바르지 않습니다');

    // 입력 검증 (DB 변경 전에 수행)
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
    if (data.categoryId && !UUID_REGEX.test(data.categoryId)) throw new Error('잘못된 카테고리 ID입니다');

    const created = await db.transaction(async (tx) => {
      // 부모 이벤트 조회
      const [parent] = await tx.select().from(calendarEvents)
        .where(and(eq(calendarEvents.id, parentId), eq(calendarEvents.userId, user.id)));
      if (!parent) throw new Error('일정을 찾을 수 없습니다');

      // excludedDates에 인스턴스 날짜 추가 (spread로 불변 복사)
      const excluded = [...(parent.excludedDates ?? [])];
      if (!excluded.includes(instanceDate)) {
        excluded.push(instanceDate);
      }

      // completedDates에서 해당 날짜 제거
      const completed = (parent.completedDates ?? []).filter(d => d !== instanceDate);

      await tx.update(calendarEvents)
        .set({ excludedDates: excluded, completedDates: completed, updatedAt: new Date() })
        .where(and(eq(calendarEvents.id, parentId), eq(calendarEvents.userId, user.id)));

      // 수정된 내용으로 새 단독 이벤트 생성
      const [row] = await tx.insert(calendarEvents)
        .values({
          userId: user.id,
          title: data.title.trim(),
          startDate: data.startDate,
          endDate: data.endDate,
          startTime: data.startTime || null,
          endTime: data.endTime || null,
          color: data.color || parent.color,
          description: data.description?.trim() || null,
          location: data.location?.trim() || null,
          categoryId: data.categoryId || null,
          isCompleted: false,
          recurrenceType: null,
          recurrenceDays: null,
          recurrenceEndDate: null,
          excludedDates: null,
        })
        .returning();

      return row;
    });

    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    return created;
  }, { parentId, instanceDate });
}

export async function deleteRecurringAfter(eventId: string, dateStr: string) {
  return traceAction('deleteRecurringAfter', async () => {
    const user = await getAuthUser();
    if (!UUID_REGEX.test(eventId)) throw new Error('잘못된 ID입니다');
    if (!DATE_REGEX.test(dateStr)) throw new Error('날짜 형식이 올바르지 않습니다');

    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const newEndDate = d.toISOString().split('T')[0];

    const [event] = await traceQuery('calendar.events.get_for_delete_after', () =>
      db.select().from(calendarEvents)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, user.id)))
    );
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
