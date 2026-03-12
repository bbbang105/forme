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

/** HH:MM 형식 시간에 분을 더한다. 자정 넘으면 null 반환 (overflow). */
function addMinutes(time: string, minutes: number): string | null {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/** YYYY-MM-DD에 일수 더하기 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이 주 수 계산 */
function weeksBetween(startDate: string, today: string): number {
  const start = new Date(startDate + 'T00:00:00+09:00');
  const now = new Date(today + 'T00:00:00+09:00');
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
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
  const result = map[kstStr];
  if (result === undefined) {
    console.error(`[cron/calendar-reminder] unexpected weekday: ${kstStr}`);
    return new Date().getDay();
  }
  return result;
}

/** 특정 유저의 리마인더 처리 */
async function processUserReminders(
  userId: string,
  today: string,
  currentTime: string,
  oneHourLater: string | null,
  tomorrow: string | null,
  dayOfWeek: number,
): Promise<number> {
  // 윈도우: currentTime ~ oneHourLater (같은 날) 또는 currentTime~23:59 + 00:00~overflow (자정 경계)
  const queries: Promise<(typeof calendarEvents.$inferSelect)[]>[] = [];

  if (oneHourLater) {
    // 자정을 넘지 않는 일반 케이스
    queries.push(
      db.select().from(calendarEvents).where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.reminderSent, false),
          isNotNull(calendarEvents.startTime),
          lte(calendarEvents.startDate, today),
          gte(calendarEvents.endDate, today),
          gte(calendarEvents.startTime, currentTime),
          lte(calendarEvents.startTime, oneHourLater),
        ),
      ),
    );
  } else {
    // 자정 경계: 오늘 currentTime~23:59 + 내일 00:00~overflow
    queries.push(
      db.select().from(calendarEvents).where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.reminderSent, false),
          isNotNull(calendarEvents.startTime),
          lte(calendarEvents.startDate, today),
          gte(calendarEvents.endDate, today),
          gte(calendarEvents.startTime, currentTime),
          lte(calendarEvents.startTime, '23:59'),
        ),
      ),
    );
    if (tomorrow) {
      const overflowMinutes = 60 - ((23 - Number(currentTime.split(':')[0])) * 60 + (59 - Number(currentTime.split(':')[1])) + 1);
      if (overflowMinutes > 0) {
        const overflowTime = addMinutes('00:00', overflowMinutes);
        if (overflowTime) {
          queries.push(
            db.select().from(calendarEvents).where(
              and(
                eq(calendarEvents.userId, userId),
                eq(calendarEvents.reminderSent, false),
                isNotNull(calendarEvents.startTime),
                lte(calendarEvents.startDate, tomorrow),
                gte(calendarEvents.endDate, tomorrow),
                gte(calendarEvents.startTime, '00:00'),
                lte(calendarEvents.startTime, overflowTime),
              ),
            ),
          );
        }
      }
    }
  }

  const results = await Promise.all(queries);
  const events = results.flat();

  const validEvents = events.filter((event) => {
    const eventDate = oneHourLater ? today : (event.startTime! >= currentTime ? today : tomorrow!);
    if (event.excludedDates?.includes(eventDate)) return false;
    if (event.recurrenceType && event.recurrenceDays) {
      if (!event.recurrenceDays.includes(dayOfWeek)) return false;
      if (event.recurrenceEndDate && eventDate > event.recurrenceEndDate) return false;
      // biweekly: 격주 검증
      if (event.recurrenceType === 'biweekly') {
        const weeks = weeksBetween(event.startDate, eventDate);
        if (weeks % 2 !== 0) return false;
      }
    }
    return true;
  });

  let sent = 0;

  for (const event of validEvents) {
    const [curH, curM] = currentTime.split(':').map(Number) as [number, number];
    const [evtH, evtM] = (event.startTime!).split(':').map(Number) as [number, number];
    let diffMin = (evtH * 60 + evtM) - (curH * 60 + curM);
    if (diffMin < 0) diffMin += 24 * 60; // 자정 경계
    const label = diffMin <= 5 ? '🔔 곧 시작' : `⏰ ${diffMin}분 후`;

    const bodyParts: string[] = [];
    if (event.startTime) bodyParts.push(`🕐 ${event.startTime}`);
    if (event.location) bodyParts.push(`📍 ${event.location}`);
    const body = bodyParts.length > 0
      ? `${bodyParts.join('  ')} — 준비하세요!`
      : '잊지 마세요!';
    try {
      await sendPushToUser(userId, {
        title: `${label}: ${event.title}`,
        body,
        tag: `calendar-reminder-${event.id}`,
        url: '/calendar',
      });
      // 즉시 reminderSent 업데이트 (레이스 방지)
      await db
        .update(calendarEvents)
        .set({ reminderSent: true })
        .where(eq(calendarEvents.id, event.id));
      sent++;
    } catch (err) {
      console.error(`[cron/calendar-reminder] push failed for event ${event.id}`, err);
    }
  }

  return sent;
}

/**
 * GET /api/cron/calendar-reminder
 * Cron: 매 5분 — 현재~1시간 이내 시작하는 일정 리마인더 푸시
 * reminderSent=true인 일정은 스킵
 */
async function handler(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userIds = await getAllUserIds();
  const today = getTodayKST();
  const currentTime = getCurrentTimeKST();
  const oneHourLater = addMinutes(currentTime, 60);
  const tomorrow = oneHourLater === null ? addDays(today, 1) : null;
  const dayOfWeek = getDayOfWeekKST();

  // 유저별 병렬 처리
  const results = await Promise.allSettled(
    userIds.map((userId) =>
      processUserReminders(userId, today, currentTime, oneHourLater, tomorrow, dayOfWeek),
    ),
  );

  const totalSent = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);

  console.info('[cron/calendar-reminder]', { today, currentTime, oneHourLater, userCount: userIds.length, totalSent });
  return NextResponse.json({ ok: true });
}

export const GET = withTracing('GET /api/cron/calendar-reminder', handler);
export const POST = withTracing('POST /api/cron/calendar-reminder', handler);
