# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace feature shortcut cards with Seoul weather widget + gamification (daily missions & streaks) on the forme dashboard.

**Architecture:** Hybrid data approach - new `user_daily_activity` table for attendance/podcast time, compute curation reads and todo completion from existing tables. Open-Meteo API for weather (no key needed). Server components with Suspense streaming.

**Tech Stack:** Drizzle ORM, Open-Meteo API, Next.js Server Components, Tailwind CSS

---

### Task 1: Add `user_daily_activity` Drizzle Schema

**Files:**
- Create: `packages/shared/src/schema/user-daily-activity.ts`
- Modify: `packages/shared/src/schema/index.ts`

**Step 1: Create schema file**

```typescript
// packages/shared/src/schema/user-daily-activity.ts
import { boolean, date, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userDailyActivity = pgTable('user_daily_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  loggedIn: boolean('logged_in').notNull().default(true),
  podcastListenSeconds: integer('podcast_listen_seconds').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index('idx_user_daily_activity_user_date').on(table.userId, table.date),
}));
```

**Step 2: Export from schema index**

Add to `packages/shared/src/schema/index.ts`:
```typescript
export * from './user-daily-activity';
```

**Step 3: Add `readAt` column to curation items**

Modify `packages/shared/src/schema/curation-items.ts` — add after `collectedAt`:
```typescript
readAt: timestamp('read_at', { withTimezone: true }),
```

**Step 4: Generate and push migration**

Run: `cd /Users/hansangho/Desktop/forme && pnpm db:generate && pnpm db:push`
Expected: Migration generated and schema pushed to DB.

**Step 5: Commit**

```bash
git add packages/shared/src/schema/user-daily-activity.ts packages/shared/src/schema/index.ts packages/shared/src/schema/curation-items.ts
git commit -m "feat: add user_daily_activity schema + readAt to curation_items"
```

---

### Task 2: Create Weather API Utility

**Files:**
- Create: `packages/web/src/lib/weather.ts`

**Step 1: Create weather utility**

```typescript
// packages/web/src/lib/weather.ts

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  dailyMax: number;
  dailyMin: number;
  weatherCode: number;
}

const SEOUL_LAT = 37.57;
const SEOUL_LON = 126.98;

/**
 * WMO Weather Code → Korean label + emoji
 */
export function getWeatherInfo(code: number): { label: string; icon: string } {
  if (code === 0) return { label: '맑음', icon: '☀️' };
  if (code <= 2) return { label: '대체로 맑음', icon: '🌤️' };
  if (code === 3) return { label: '흐림', icon: '☁️' };
  if (code <= 48) return { label: '안개', icon: '🌫️' };
  if (code <= 57) return { label: '이슬비', icon: '🌦️' };
  if (code <= 67) return { label: '비', icon: '🌧️' };
  if (code <= 77) return { label: '눈', icon: '❄️' };
  if (code <= 82) return { label: '소나기', icon: '🌧️' };
  if (code <= 86) return { label: '눈보라', icon: '🌨️' };
  if (code <= 99) return { label: '뇌우', icon: '⛈️' };
  return { label: '알 수 없음', icon: '🌡️' };
}

/**
 * Fetch Seoul weather from Open-Meteo (free, no API key).
 * Returns null on failure (graceful degradation).
 */
export async function getSeoulWeather(): Promise<WeatherData | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(SEOUL_LAT),
      longitude: String(SEOUL_LON),
      current: 'temperature_2m,weather_code,apparent_temperature',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Seoul',
      forecast_days: '1',
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 3600 }, // 1-hour cache
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      temperature: Math.round(data.current.temperature_2m),
      apparentTemperature: Math.round(data.current.apparent_temperature),
      dailyMax: Math.round(data.daily.temperature_2m_max[0]),
      dailyMin: Math.round(data.daily.temperature_2m_min[0]),
      weatherCode: data.current.weather_code,
    };
  } catch {
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add packages/web/src/lib/weather.ts
git commit -m "feat: add Open-Meteo weather utility for Seoul"
```

---

### Task 3: Create Activity Server Actions (Attendance + Streaks)

**Files:**
- Create: `packages/web/src/lib/actions/activity.ts`

**Step 1: Create activity actions**

```typescript
// packages/web/src/lib/actions/activity.ts
'use server';

import { getAuthUser } from '@/lib/auth';
import { traceAction, traceQuery } from '@/lib/logger';
import { db, userDailyActivity, curationItems, curationSources, todos } from '@forme/shared';
import { and, eq, sql, desc, count } from 'drizzle-orm';

/**
 * KST 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getKstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * 출석 기록 (대시보드 방문 시 호출)
 */
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

/**
 * 팟캐스트 청취 시간 업데이트 (클라이언트에서 주기적 호출)
 */
export async function updateListeningTime(seconds: number) {
  return traceAction('updateListeningTime', async () => {
    const user = await getAuthUser();
    const today = getKstToday();

    if (typeof seconds !== 'number' || seconds < 0 || seconds > 86400) {
      throw new Error('Invalid seconds value');
    }

    await traceQuery('activity.upsert-listening', () =>
      db
        .insert(userDailyActivity)
        .values({
          userId: user.id,
          date: today,
          podcastListenSeconds: Math.round(seconds),
        })
        .onConflictDoUpdate({
          target: [userDailyActivity.userId, userDailyActivity.date],
          set: { podcastListenSeconds: Math.round(seconds) },
        })
    );
  }, { seconds });
}

/**
 * 오늘의 미션 진행 상황 + 스트릭 계산
 */
export async function getDailyMissionStats() {
  return traceAction('getDailyMissionStats', async () => {
    const user = await getAuthUser();
    const today = getKstToday();

    // 1. 출석 스트릭 (연속 로그인 일수)
    const activityRows = await traceQuery('activity.streak-data', () =>
      db
        .select({ date: userDailyActivity.date })
        .from(userDailyActivity)
        .where(eq(userDailyActivity.userId, user.id))
        .orderBy(desc(userDailyActivity.date))
        .limit(365)
    );

    const attendanceStreak = calculateStreak(activityRows.map(r => r.date), today);

    // 2. 오늘 큐레이션 읽은 수
    const [curationResult] = await traceQuery('activity.curation-reads', () =>
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
    );
    const curationReadsToday = curationResult?.count ?? 0;

    // 3. 큐레이션 스트릭 (연속 5개 이상 읽은 일수)
    const curationDailyReads = await traceQuery('activity.curation-daily', () =>
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
    );
    const curationStreak = calculateStreak(curationDailyReads.map(r => r.date), today);

    // 4. 오늘 팟캐스트 청취 시간
    const [podcastResult] = await traceQuery('activity.podcast-time', () =>
      db
        .select({ seconds: userDailyActivity.podcastListenSeconds })
        .from(userDailyActivity)
        .where(
          and(
            eq(userDailyActivity.userId, user.id),
            eq(userDailyActivity.date, today),
          )
        )
    );
    const podcastSecondsToday = podcastResult?.seconds ?? 0;

    // 5. 팟캐스트 스트릭 (연속 10분 이상 들은 일수)
    const podcastDays = await traceQuery('activity.podcast-daily', () =>
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
    );
    const podcastStreak = calculateStreak(podcastDays.map(r => r.date), today);

    // 6. 오늘 투두 완료 현황
    const todayTodos = await traceQuery('activity.todos-today', () =>
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
    );
    const todosTotal = todayTodos[0]?.total ?? 0;
    const todosCompleted = todayTodos[0]?.completed ?? 0;

    // 7. 투두 스트릭 (연속 전체 완료 일수, 투두가 1개 이상 있고 모두 완료)
    const todoCompleteDays = await traceQuery('activity.todos-streak', () =>
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
    );
    const todoStreak = calculateStreak(todoCompleteDays.map(r => r.date), today);

    return {
      attendance: { streak: attendanceStreak },
      curation: { today: curationReadsToday, target: 5, streak: curationStreak },
      podcast: { todaySeconds: podcastSecondsToday, targetSeconds: 600, streak: podcastStreak },
      todos: { completed: todosCompleted, total: todosTotal, streak: todoStreak },
    };
  });
}

/**
 * 연속 일수 계산. 날짜 배열(DESC 정렬)에서 오늘부터 연속된 일수를 센다.
 * 오늘 날짜가 포함되어야 스트릭 시작. 포함 안 되면 0.
 */
function calculateStreak(dates: string[], today: string): number {
  if (dates.length === 0) return 0;

  // 오늘이 포함되지 않으면 스트릭 0
  if (dates[0] !== today) return 0;

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
```

**Step 2: Commit**

```bash
git add packages/web/src/lib/actions/activity.ts
git commit -m "feat: add activity server actions (attendance, streaks, missions)"
```

---

### Task 4: Update Curation PATCH to Set `readAt`

**Files:**
- Modify: `packages/web/src/app/api/curation/[id]/route.ts`

**Step 1: Update the PATCH handler**

In the update payload building section (around line 109-115), modify to set `readAt` when marking as read:

```typescript
// Before:
const updateValues: Partial<{
  isRead: boolean;
  isBookmarked: boolean;
}> = {};

if (isRead !== undefined) updateValues.isRead = isRead;
if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;

// After:
const updateValues: Partial<{
  isRead: boolean;
  isBookmarked: boolean;
  readAt: Date | null;
}> = {};

if (isRead !== undefined) {
  updateValues.isRead = isRead;
  updateValues.readAt = isRead ? new Date() : null;
}
if (isBookmarked !== undefined) updateValues.isBookmarked = isBookmarked;
```

**Step 2: Verify build**

Run: `pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/web/src/app/api/curation/[id]/route.ts
git commit -m "feat: set readAt timestamp when marking curation item as read"
```

---

### Task 5: Add Podcast Listening Time Sync to PlayerContext

**Files:**
- Modify: `packages/web/src/components/features/podcast/player-context.tsx`

**Step 1: Add listening time tracking**

Add import at top:
```typescript
import { updateListeningTime } from '@/lib/actions/activity';
```

Add a new effect after the existing "Save progress" effect (after line 152), to sync listening time to DB every 30 seconds:

```typescript
// Sync listening time to DB for gamification
useEffect(() => {
  if (!episode || !isPlaying) return;

  let sessionSeconds = 0;
  const interval = setInterval(async () => {
    sessionSeconds += 30;
    try {
      // Fetch current DB value and add this session's time
      await updateListeningTime(sessionSeconds);
    } catch { /* silent fail — gamification is non-critical */ }
  }, 30_000);

  return () => clearInterval(interval);
}, [episode, isPlaying]);
```

Wait — this approach has a problem. Each time the effect re-runs, sessionSeconds resets. Better approach: track accumulated seconds in a ref and sync the cumulative amount.

Actually, simpler: use a ref to track total seconds played today, increment it via the `timeupdate` event, and sync to DB periodically.

Replace the above with this approach — add a `listenSecondsRef` and sync logic:

After `const savedTimeRef = useRef(0);` (line 56), add:
```typescript
const listenSecondsRef = useRef(0);
const lastSyncRef = useRef(0);
```

In the `onTimeUpdate` handler (line 64), add listening time tracking:
```typescript
const onTimeUpdate = () => {
  setCurrentTime(audio.currentTime);
  // Track listening time for gamification
  listenSecondsRef.current += 1; // timeupdate fires ~every 250ms, but we approximate at 1s intervals
};
```

Wait, timeupdate fires roughly every 250ms, not every second. Better to track elapsed actual time:

Actually, let's keep it simpler. Add a separate effect that runs a 30-second interval to sync:

```typescript
// Sync podcast listening time to DB every 30s while playing
useEffect(() => {
  if (!isPlaying) return;

  const interval = setInterval(async () => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    listenSecondsRef.current += 30;
    if (listenSecondsRef.current - lastSyncRef.current >= 30) {
      lastSyncRef.current = listenSecondsRef.current;
      try {
        await updateListeningTime(listenSecondsRef.current);
      } catch { /* gamification non-critical */ }
    }
  }, 30_000);

  return () => clearInterval(interval);
}, [isPlaying]);
```

Hmm, still complex. Simplify:

```typescript
const listenAccumRef = useRef(0);
```

New effect after save effect:
```typescript
// Sync podcast listening time to DB for gamification
useEffect(() => {
  if (!isPlaying) return;

  const interval = setInterval(async () => {
    listenAccumRef.current += 30;
    try {
      await updateListeningTime(listenAccumRef.current);
    } catch { /* non-critical */ }
  }, 30_000);

  return () => clearInterval(interval);
}, [isPlaying]);
```

This tracks cumulative seconds listened today. The server action does UPSERT with the total value. On page reload, it resets to 0 but server has the real value — the next sync will be low.

Better: Initialize `listenAccumRef` from the DB on mount. But that adds complexity. For a personal app, just add to existing value on server side instead of replacing.

**Final approach:** Change `updateListeningTime` to ADD seconds instead of SET:

In `packages/web/src/lib/actions/activity.ts`, change the UPSERT to increment:
```typescript
.onConflictDoUpdate({
  target: [userDailyActivity.userId, userDailyActivity.date],
  set: {
    podcastListenSeconds: sql`${userDailyActivity.podcastListenSeconds} + ${Math.round(seconds)}`,
  },
})
```

And in PlayerContext, sync every 30s with delta=30:
```typescript
// Sync podcast listening time to DB for gamification (every 30s while playing)
useEffect(() => {
  if (!isPlaying) return;

  const interval = setInterval(async () => {
    try {
      await updateListeningTime(30); // add 30 seconds
    } catch { /* non-critical */ }
  }, 30_000);

  return () => clearInterval(interval);
}, [isPlaying]);
```

This is the cleanest approach. 30 seconds playing → add 30s to DB.

**Step 2: Commit**

```bash
git add packages/web/src/components/features/podcast/player-context.tsx packages/web/src/lib/actions/activity.ts
git commit -m "feat: sync podcast listening time to DB every 30s"
```

---

### Task 6: Create Weather Widget Component

**Files:**
- Create: `packages/web/src/components/features/dashboard/weather-widget.tsx`

**Step 1: Create component**

```typescript
// packages/web/src/components/features/dashboard/weather-widget.tsx
import { getSeoulWeather, getWeatherInfo } from '@/lib/weather';

export async function WeatherWidget() {
  const weather = await getSeoulWeather();

  if (!weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="text-lg">{icon}</span>
      <span className="font-medium text-foreground">{weather.temperature}°</span>
      <span className="text-xs">
        체감 {weather.apparentTemperature}° · {weather.dailyMin}° / {weather.dailyMax}°
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/features/dashboard/weather-widget.tsx
git commit -m "feat: add Seoul weather widget (server component)"
```

---

### Task 7: Create Daily Missions Component

**Files:**
- Create: `packages/web/src/components/features/dashboard/daily-missions.tsx`
- Create: `packages/web/src/components/features/dashboard/attendance-recorder.tsx`

**Step 1: Create attendance recorder (client component)**

This tiny client component calls `recordAttendance()` on mount to log the visit:

```typescript
// packages/web/src/components/features/dashboard/attendance-recorder.tsx
'use client';

import { useEffect, useRef } from 'react';
import { recordAttendance } from '@/lib/actions/activity';

export function AttendanceRecorder() {
  const called = useRef(false);
  useEffect(() => {
    if (called.current) return;
    called.current = true;
    recordAttendance().catch(() => {});
  }, []);
  return null;
}
```

**Step 2: Create daily missions server component**

```typescript
// packages/web/src/components/features/dashboard/daily-missions.tsx
import { getDailyMissionStats } from '@/lib/actions/activity';
import { cn } from '@/lib/utils';

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const completed = current >= target;

  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', color, completed && 'animate-pulse')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export async function DailyMissions() {
  const stats = await getDailyMissionStats();

  const missions = [
    {
      emoji: '📰',
      label: '큐레이션 읽기',
      current: stats.curation.today,
      target: stats.curation.target,
      displayCurrent: `${stats.curation.today}`,
      displayTarget: `${stats.curation.target}`,
      streak: stats.curation.streak,
      color: 'bg-blue-500',
      remaining: stats.curation.target - stats.curation.today,
      unit: '개',
    },
    {
      emoji: '🎧',
      label: '팟캐스트 듣기',
      current: stats.podcast.todaySeconds,
      target: stats.podcast.targetSeconds,
      displayCurrent: formatSeconds(stats.podcast.todaySeconds),
      displayTarget: '10:00',
      streak: stats.podcast.streak,
      color: 'bg-purple-500',
      remaining: Math.max(0, stats.podcast.targetSeconds - stats.podcast.todaySeconds),
      unit: '',
    },
    {
      emoji: '✅',
      label: '투두 완료',
      current: stats.todos.completed,
      target: Math.max(stats.todos.total, 1),
      displayCurrent: `${stats.todos.completed}`,
      displayTarget: `${stats.todos.total}`,
      streak: stats.todos.streak,
      color: 'bg-green-500',
      remaining: stats.todos.total - stats.todos.completed,
      unit: '개',
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4">
      {/* Attendance streak header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">오늘의 미션</h3>
        {stats.attendance.streak > 0 && (
          <span className="text-sm font-medium">
            🔥 {stats.attendance.streak}일 연속 출석
          </span>
        )}
      </div>

      {/* Mission progress items */}
      <div className="space-y-3">
        {missions.map((m) => {
          const completed = m.current >= m.target;
          return (
            <div key={m.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span>{m.emoji}</span>
                  <span className={cn(completed && 'text-muted-foreground line-through')}>
                    {m.label}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.displayCurrent} / {m.displayTarget}
                </span>
              </div>
              <ProgressBar current={m.current} target={m.target} color={m.color} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {completed
                    ? '달성!'
                    : m.label === '팟캐스트 듣기'
                      ? `${formatSeconds(m.remaining)} 남음`
                      : `${m.remaining}${m.unit} 남음`
                  }
                </span>
                {m.streak > 0 && (
                  <span>{m.streak}일 연속</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/web/src/components/features/dashboard/daily-missions.tsx packages/web/src/components/features/dashboard/attendance-recorder.tsx
git commit -m "feat: add daily missions + attendance recorder components"
```

---

### Task 8: Rewrite Dashboard Page

**Files:**
- Modify: `packages/web/src/app/(main)/dashboard/page.tsx`

**Step 1: Rewrite page**

Replace entire file content:

```typescript
import { Suspense } from 'react';
import { DashboardCuration } from '@/components/features/curation/dashboard-curation';
import { DashboardCalendar } from '@/components/features/calendar/dashboard-calendar';
import { DashboardMemo } from '@/components/features/memo/dashboard-memo';
import { WeatherWidget } from '@/components/features/dashboard/weather-widget';
import { DailyMissions } from '@/components/features/dashboard/daily-missions';
import { AttendanceRecorder } from '@/components/features/dashboard/attendance-recorder';
import { createClient } from '@/lib/supabase/server';
import { db, profiles } from '@forme/shared';
import { eq } from 'drizzle-orm';
import { getFormattedDate, getGreeting } from '@/lib/greetings';

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-28 bg-muted rounded-md" />
      <div className="rounded-xl border border-border/60 bg-muted/40 h-44" />
    </div>
  );
}

function MissionsSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-2 w-full bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = '유저';
  if (user) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    if (profile?.displayName) {
      displayName = profile.displayName;
    }
  }

  const greeting = getGreeting();
  const dateStr = getFormattedDate();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* Record attendance on visit */}
      <AttendanceRecorder />

      {/* Hero: Greeting + Weather */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{dateStr}</p>
        <h2 className="text-2xl font-bold tracking-tight">안녕하세요, {displayName}님!</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <Suspense fallback={<div className="h-5" />}>
          <WeatherWidget />
        </Suspense>
      </div>

      {/* Daily Missions */}
      <Suspense fallback={<MissionsSkeleton />}>
        <DailyMissions />
      </Suspense>

      {/* Today's calendar & todos */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCalendar />
      </Suspense>

      {/* Latest curation items */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCuration />
      </Suspense>

      {/* Recent memos */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardMemo />
      </Suspense>
    </div>
  );
}
```

**Step 2: Verify dev server**

Run: `pnpm dev` and check `http://localhost:3200/dashboard`
Expected: New layout with weather, missions, and existing widgets.

**Step 3: Commit**

```bash
git add packages/web/src/app/(main)/dashboard/page.tsx
git commit -m "feat: redesign dashboard with weather + gamification missions"
```

---

### Task 9: Typecheck + Build Verification

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No lint errors (fix any that appear).

**Step 3: Run build**

Run: `pnpm build`
Expected: Successful build.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -p  # stage only changed files
git commit -m "fix: resolve typecheck/lint issues from dashboard redesign"
```
