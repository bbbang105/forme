import {NextResponse} from 'next/server';
import {and, eq, lt, sql} from 'drizzle-orm';
import {db, calendarEvents, todos} from '@forme/shared';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';
import {verifyCronAuth} from '@/lib/cron-auth';

export const maxDuration = 30;

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function getTodayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * GET /api/cron/calendar-daily
 * Vercel Cron: 매일 08:00 KST (23:00 UTC) — 오늘 일정/할일 요약 푸시
 */
export const GET = withTracing('GET /api/cron/calendar-daily', async (request) => {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = auth.userId;

  const today = getTodayKST();

  // 과거 이벤트의 reminderSent 리셋 (오늘 이전 날짜만 — 반복 일정 대응)
  await db
    .update(calendarEvents)
    .set({ reminderSent: false })
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.reminderSent, true),
        lt(calendarEvents.startDate, today),
      ),
    );

  const [eventCount, todoCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          sql`${calendarEvents.startDate} <= ${today}`,
          sql`${calendarEvents.endDate} >= ${today}`,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          eq(todos.date, today),
          eq(todos.isCompleted, false),
        ),
      ),
  ]);

  const events = eventCount[0]?.count ?? 0;
  const todosLeft = todoCount[0]?.count ?? 0;

  console.info('[cron/calendar-daily]', { today, events, todosLeft });

  if (events === 0 && todosLeft === 0) {
    return NextResponse.json({ ok: true });
  }

  const parts: string[] = [];
  if (events > 0) parts.push(`일정 ${events}개`);
  if (todosLeft > 0) parts.push(`할 일 ${todosLeft}개`);

  try {
    await sendPushToUser(userId, {
      title: `오늘 ${parts.join(', ')}가 있어요`,
      body: '캘린더에서 확인해보세요!',
      tag: 'calendar-daily',
      url: '/calendar',
    });
  } catch (err) {
    console.error('[cron/calendar-daily] push notification failed', err);
  }

  return NextResponse.json({ ok: true });
});
