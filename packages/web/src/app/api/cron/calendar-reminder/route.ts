import {NextResponse} from 'next/server';
import {and, eq, gte, isNotNull, lte} from 'drizzle-orm';
import {calendarEvents, db} from '@forme/shared';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';
import {getAllUserIds, verifyCronSecret} from '@/lib/cron-auth';

export const maxDuration = 30;

/** KST 현재 날짜 (YYYY-MM-DD) */
function getTodayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** KST 현재 시간 (HH:MM) */
function getCurrentTimeKST(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** HH:MM 형식 시간에 분을 더한다. 자정 넘으면 "23:59" 반환. */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return '23:59';
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/** KST 요일 (0=Sun, 1=Mon, ... 6=Sat) */
function getDayOfWeekKST(): number {
  const kstStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[kstStr] ?? 0;
}

/**
 * GET /api/cron/calendar-reminder
 * Cron: 매 15분 — 모든 유저의 1시간 후 시작하는 일정 리마인더 푸시
 */
export const GET = withTracing('GET /api/cron/calendar-reminder', async (request) => {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userIds = await getAllUserIds();
  const today = getTodayKST();
  const currentTime = getCurrentTimeKST();
  const earliestTime = addMinutes(currentTime, 45);
  const laterTime = addMinutes(currentTime, 75);
  const dayOfWeek = getDayOfWeekKST();

  let totalSent = 0;

  for (const userId of userIds) {
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.reminderSent, false),
          isNotNull(calendarEvents.startTime),
          lte(calendarEvents.startDate, today),
          gte(calendarEvents.endDate, today),
          gte(calendarEvents.startTime, earliestTime),
          lte(calendarEvents.startTime, laterTime),
        ),
      );

    const validEvents = events.filter((event) => {
      if (event.excludedDates?.includes(today)) return false;
      if (event.recurrenceType && event.recurrenceDays) {
        if (!event.recurrenceDays.includes(dayOfWeek)) return false;
        if (event.recurrenceEndDate && today > event.recurrenceEndDate) return false;
      }
      return true;
    });

    const sentIds: string[] = [];

    for (const event of validEvents) {
      const body = [event.startTime, event.location].filter(Boolean).join(' @ ');
      try {
        await sendPushToUser(userId, {
          title: `1시간 후: ${event.title}`,
          body: body || event.startTime || '',
          tag: `calendar-reminder-${event.id}`,
          url: '/calendar',
        });
        totalSent++;
        sentIds.push(event.id);
      } catch (err) {
        console.error(`[cron/calendar-reminder] push failed for event ${event.id}`, err);
      }
    }

    await Promise.allSettled(
      sentIds.map((id) =>
        db
          .update(calendarEvents)
          .set({ reminderSent: true })
          .where(eq(calendarEvents.id, id))
      ),
    );
  }

  console.info('[cron/calendar-reminder]', { today, currentTime, laterTime, userCount: userIds.length, totalSent });
  return NextResponse.json({ ok: true });
});
