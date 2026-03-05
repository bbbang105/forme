'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {curationItems, curationSources, db, todos, userDailyActivity} from '@forme/shared';
import {and, count, desc, eq, sql} from 'drizzle-orm';

function getKstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** 출석 기록 (대시보드 방문 시 호출) */
export async function recordAttendance() {
  return traceAction('recordAttendance', async () => {
    const user = await getAuthUser();
    const today = getKstToday();

    await traceQuery('activity.upsert-attendance', () =>
      db
        .insert(userDailyActivity)
        .values({ userId: user.id, date: today, loggedIn: true })
        .onConflictDoNothing()
    );
  });
}

/** 팟캐스트 청취 시간 증가 (delta초 추가) */
export async function addListeningTime(deltaSeconds: number) {
  return traceAction('addListeningTime', async () => {
    const user = await getAuthUser();
    const today = getKstToday();

    if (typeof deltaSeconds !== 'number' || deltaSeconds <= 0 || deltaSeconds > 3600) {
      throw new Error('Invalid delta seconds');
    }

    const rounded = Math.round(deltaSeconds);

    await traceQuery('activity.add-listening', () =>
      db
        .insert(userDailyActivity)
        .values({
          userId: user.id,
          date: today,
          podcastListenSeconds: rounded,
        })
        .onConflictDoUpdate({
          target: [userDailyActivity.userId, userDailyActivity.date],
          set: {
            podcastListenSeconds: sql`LEAST(${userDailyActivity.podcastListenSeconds} + ${rounded}, 86400)`,
          },
        })
    );
  }, { deltaSeconds });
}

/** 오늘의 미션 진행 상황 + 스트릭 계산 */
export async function getDailyMissionStats() {
  return traceAction('getDailyMissionStats', async () => {
    const user = await getAuthUser();
    const today = getKstToday();

    // 모든 쿼리를 병렬 실행 (독립적, 서로 의존 없음)
    const [
      activityRows,
      curationReadRows,
      curationDailyReads,
      podcastTimeRows,
      podcastDays,
      todayTodos,
      todoCompleteDays,
    ] = await Promise.all([
      // 1. 출석 데이터 (연속 로그인)
      traceQuery('activity.streak-data', () =>
        db
          .select({ date: userDailyActivity.date })
          .from(userDailyActivity)
          .where(eq(userDailyActivity.userId, user.id))
          .orderBy(desc(userDailyActivity.date))
          .limit(365)
      ),
      // 2. 오늘 큐레이션 읽은 수
      traceQuery('activity.curation-reads', () =>
        db
          .select({ count: count() })
          .from(curationItems)
          .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
          .where(
            and(
              eq(curationSources.userId, user.id),
              eq(curationItems.isRead, true),
              sql`DATE(${curationItems.readAt} AT TIME ZONE 'Asia/Seoul') = ${today}`,
            )
          )
      ),
      // 3. 큐레이션 스트릭 (연속 5개 이상 읽은 일수)
      traceQuery('activity.curation-daily', () =>
        db
          .select({
            date: sql<string>`DATE(${curationItems.readAt} AT TIME ZONE 'Asia/Seoul')`.as('read_date'),
            count: count(),
          })
          .from(curationItems)
          .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
          .where(
            and(
              eq(curationSources.userId, user.id),
              eq(curationItems.isRead, true),
              sql`${curationItems.readAt} IS NOT NULL`,
            )
          )
          .groupBy(sql`DATE(${curationItems.readAt} AT TIME ZONE 'Asia/Seoul')`)
          .having(sql`COUNT(*) >= 5`)
          .orderBy(sql`read_date DESC`)
          .limit(365)
      ),
      // 4. 오늘 팟캐스트 청취 시간
      traceQuery('activity.podcast-time', () =>
        db
          .select({ seconds: userDailyActivity.podcastListenSeconds })
          .from(userDailyActivity)
          .where(
            and(
              eq(userDailyActivity.userId, user.id),
              eq(userDailyActivity.date, today),
            )
          )
      ),
      // 5. 팟캐스트 스트릭 (연속 10분 이상)
      traceQuery('activity.podcast-daily', () =>
        db
          .select({ date: userDailyActivity.date })
          .from(userDailyActivity)
          .where(
            and(
              eq(userDailyActivity.userId, user.id),
              sql`${userDailyActivity.podcastListenSeconds} >= 600`,
            )
          )
          .orderBy(desc(userDailyActivity.date))
          .limit(365)
      ),
      // 6. 오늘 투두 현황
      traceQuery('activity.todos-today', () =>
        db
          .select({
            total: count(),
            completed: sql<number>`COUNT(*) FILTER (WHERE ${todos.isCompleted} = true)`,
          })
          .from(todos)
          .where(
            and(
              eq(todos.userId, user.id),
              eq(todos.date, today),
            )
          )
      ),
      // 7. 투두 스트릭 (연속 전체 완료)
      traceQuery('activity.todos-streak', () =>
        db
          .select({ date: todos.date })
          .from(todos)
          .where(eq(todos.userId, user.id))
          .groupBy(todos.date)
          .having(
            and(
              sql`COUNT(*) > 0`,
              sql`COUNT(*) FILTER (WHERE ${todos.isCompleted} = false) = 0`,
            )
          )
          .orderBy(sql`${todos.date} DESC`)
          .limit(365)
      ),
    ]);

    const attendanceStreak = calculateStreak(activityRows.map(r => r.date), today);
    const curationReadsToday = curationReadRows[0]?.count ?? 0;
    const curationStreak = calculateStreak(curationDailyReads.map(r => r.date), today);
    const podcastSecondsToday = podcastTimeRows[0]?.seconds ?? 0;
    const podcastStreak = calculateStreak(podcastDays.map(r => r.date), today);
    const todosTotal = todayTodos[0]?.total ?? 0;
    const todosCompleted = todayTodos[0]?.completed ?? 0;
    const todoStreak = calculateStreak(todoCompleteDays.map(r => r.date), today);

    return {
      attendance: { streak: attendanceStreak },
      curation: { today: curationReadsToday, target: 5, streak: curationStreak },
      podcast: { todaySeconds: podcastSecondsToday, targetSeconds: 600, streak: podcastStreak },
      todos: { completed: todosCompleted, total: todosTotal, streak: todoStreak },
    };
  });
}

/** 연속 일수 계산 (날짜 배열 DESC, 오늘 포함 필수) */
function calculateStreak(dates: string[], today: string): number {
  if (dates.length === 0 || dates[0] !== today) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const expected = getDateMinusDays(today, i);
    if (dates[i] === expected) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getDateMinusDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}
