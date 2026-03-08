# 캘린더/투두 푸시알림 + UX 개선 구현 플랜

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 캘린더 일정 푸시 알림(데일리 요약 + 1시간 전 리마인더) 및 투두/캘린더 UX 개선(완료 애니메이션, 빈 상태, 컬러 dot, 밀린 투두)

**Architecture:** 기존 Cron+Push 인프라를 그대로 활용하여 2개 cron 엔드포인트 추가. calendar_events에 reminderSent 컬럼 추가. UX 개선은 기존 컴포넌트 수정으로 처리.

**Tech Stack:** Next.js 16, Drizzle ORM, web-push, Vercel Cron, @dnd-kit, Tailwind CSS 4

---

## Task 1: DB 스키마 — reminderSent 컬럼 추가

**Files:**
- Modify: `packages/shared/src/schema/calendar-events.ts`

**Step 1: 스키마에 reminderSent 컬럼 추가**

`calendar-events.ts`의 `isCompleted` 다음 줄에 추가:
```typescript
reminderSent: boolean('reminder_sent').notNull().default(false),
```

**Step 2: 마이그레이션 생성 및 push**

```bash
pnpm db:generate
pnpm db:push
```

**Step 3: 타입 체크**

```bash
pnpm typecheck
```

---

## Task 2: 데일리 요약 Cron API

**Files:**
- Create: `packages/web/src/app/api/cron/calendar-daily/route.ts`

**Step 1: API 라우트 작성**

기존 cron/curation 패턴 복제. 오늘 일정 수 + 미완료 투두 수 조회. 둘 다 0이면 스킵.

```typescript
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {calendarEvents, db, todos} from '@forme/shared';
import {and, eq, gte, lte, sql} from 'drizzle-orm';

export const maxDuration = 30;

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const GET = withTracing('GET /api/cron/calendar-daily', async (request) => {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.CRON_USER_ID?.trim();
  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // KST 오늘 날짜 계산
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  const [eventRows, todoRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startDate, today),
        gte(calendarEvents.endDate, today),
      )),
    db
      .select({ count: sql<number>`count(*)` })
      .from(todos)
      .where(and(
        eq(todos.userId, userId),
        eq(todos.date, today),
        eq(todos.isCompleted, false),
      )),
  ]);

  const eventCount = Number(eventRows[0]?.count ?? 0);
  const todoCount = Number(todoRows[0]?.count ?? 0);

  // 둘 다 0이면 알림 스킵
  if (eventCount === 0 && todoCount === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no events or todos' });
  }

  const parts: string[] = [];
  if (eventCount > 0) parts.push(`일정 ${eventCount}개`);
  if (todoCount > 0) parts.push(`할 일 ${todoCount}개`);

  try {
    await sendPushToUser(userId, {
      title: `오늘 ${parts.join(', ')}가 있어요`,
      body: '좋은 하루 되세요! 오늘의 일정을 확인해보세요.',
      tag: 'calendar-daily',
      url: '/calendar',
    });
  } catch (err) {
    console.error('[cron/calendar-daily] push failed', err);
  }

  return NextResponse.json({ ok: true, eventCount, todoCount });
});
```

**Step 2: 타입 체크**

```bash
pnpm typecheck
```

---

## Task 3: 일정 리마인더 Cron API

**Files:**
- Create: `packages/web/src/app/api/cron/calendar-reminder/route.ts`

**Step 1: API 라우트 작성**

15분마다 실행. startTime 기준으로 현재~1시간15분 후 범위의 이벤트 중 reminderSent=false 조회. 반복 일정은 오늘 날짜에 인스턴스가 있는지 판별.

```typescript
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {sendPushToUser} from '@/lib/push';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {calendarEvents, db} from '@forme/shared';
import {and, eq, gte, isNotNull, lte, sql} from 'drizzle-orm';

export const maxDuration = 30;

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const GET = withTracing('GET /api/cron/calendar-reminder', async (request) => {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.CRON_USER_ID?.trim();
  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // KST 현재 시간
  const now = new Date();
  const kstFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
  const kstTimeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const today = kstFormatter.format(now);
  const currentTime = kstTimeFormatter.format(now); // "HH:MM"

  // 1시간15분 후 시간 계산
  const later = new Date(now.getTime() + 75 * 60 * 1000);
  const laterTime = kstTimeFormatter.format(later);
  const laterDate = kstFormatter.format(later);

  // 비반복 일정: 오늘 날짜 + startTime 범위 + reminderSent=false
  const events = await db
    .select()
    .from(calendarEvents)
    .where(and(
      eq(calendarEvents.userId, userId),
      eq(calendarEvents.reminderSent, false),
      isNotNull(calendarEvents.startTime),
      lte(calendarEvents.startDate, today),
      gte(calendarEvents.endDate, today),
      // startTime이 currentTime~laterTime 범위
      gte(calendarEvents.startTime, currentTime),
      lte(calendarEvents.startTime, laterTime),
    ));

  // 반복 일정 중 오늘 인스턴스 해당하는 것 필터 + excludedDates 체크
  const todayDow = new Date(today + 'T00:00:00+09:00').getDay();
  const validEvents = events.filter((e) => {
    // 반복 일정인 경우 오늘 요일이 recurrenceDays에 포함되어야 함
    if (e.recurrenceType && e.recurrenceDays) {
      if (!e.recurrenceDays.includes(todayDow)) return false;
    }
    // excludedDates에 오늘이 포함되면 스킵
    if (e.excludedDates?.includes(today)) return false;
    return true;
  });

  let sentCount = 0;
  for (const event of validEvents) {
    try {
      await sendPushToUser(userId, {
        title: `1시간 후: ${event.title}`,
        body: `${event.startTime} ${event.location ? `@ ${event.location}` : ''}`.trim(),
        tag: `calendar-reminder-${event.id}`,
        url: '/calendar',
      });
      sentCount++;

      // reminderSent 마킹
      await db
        .update(calendarEvents)
        .set({ reminderSent: true })
        .where(eq(calendarEvents.id, event.id));
    } catch (err) {
      console.error(`[cron/calendar-reminder] push failed for ${event.id}`, err);
    }
  }

  return NextResponse.json({ ok: true, checked: events.length, sent: sentCount });
});
```

**Step 2: reminderSent 리셋 로직 — 반복 일정 대응**

반복 일정은 매일 다시 알림을 보내야 하므로, 데일리 요약 cron(`calendar-daily`)에서 전날 reminderSent를 리셋하는 로직 추가:

calendar-daily route.ts 상단에 추가:
```typescript
// 전날 reminderSent 리셋 (반복 일정 대응)
await db
  .update(calendarEvents)
  .set({ reminderSent: false })
  .where(and(
    eq(calendarEvents.userId, userId),
    eq(calendarEvents.reminderSent, true),
  ));
```

**Step 3: 타입 체크**

```bash
pnpm typecheck
```

---

## Task 4: Vercel Cron 설정

**Files:**
- Modify: `vercel.json`

**Step 1: cron 추가**

```json
{
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/curation",
      "schedule": "0 22 * * *"
    },
    {
      "path": "/api/cron/calendar-daily",
      "schedule": "0 23 * * *"
    },
    {
      "path": "/api/cron/calendar-reminder",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

---

## Task 5: 투두 완료 애니메이션

**Files:**
- Modify: `packages/web/src/components/features/calendar/todo-list.tsx`
- Modify: `packages/web/src/app/globals.css` (또는 tailwind 설정에 keyframe 추가)

**Step 1: 체크 아이콘 바운스 애니메이션**

TodoItem의 체크 버튼에 완료 시 바운스 효과:
- `CheckCircle2`에 `animate-bounce-check` 클래스 적용
- CSS keyframe: scale(0.8) → scale(1.2) → scale(1)

**Step 2: 텍스트 strikethrough 트랜지션**

완료 시 텍스트에 `animate-strikethrough` 적용.

---

## Task 6: 빈 상태 개선

**Files:**
- Modify: `packages/web/src/components/features/calendar/todo-list.tsx` (투두 빈 상태)
- Modify: `packages/web/src/components/features/calendar/event-list.tsx` (일정 빈 상태)

**Step 1: 랜덤 격려 문구 배열 + 이모지**

투두 빈 상태:
```tsx
const emptyMessages = [
  { emoji: '🎉', text: '오늘은 자유의 날!' },
  { emoji: '☀️', text: '할 일 없는 하루도 좋아요' },
  { emoji: '🌴', text: '여유로운 하루 보내세요' },
  { emoji: '✨', text: '오늘은 쉬어가는 날' },
  { emoji: '🍀', text: '행운 가득한 하루!' },
];
```

일정 빈 상태 (event-list에서 dayEvents.length === 0일 때):
```tsx
const emptyMessages = [
  { emoji: '📅', text: '오늘은 일정이 없어요' },
  { emoji: '🌿', text: '한가로운 하루네요' },
  { emoji: '☕', text: '여유롭게 보내세요' },
];
```

`useMemo`로 컴포넌트 마운트 시 1개 랜덤 선택 (리렌더 시 안 바뀌도록).

---

## Task 7: 캘린더 그리드 컬러 dot

**Files:**
- Modify: `packages/web/src/components/features/calendar/calendar-grid.tsx` — DayCell

**Step 1: 날짜 숫자 아래 컬러 dot 추가**

DayCell의 날짜 숫자 `<span>` 아래에 이벤트 색상 dot 렌더:
```tsx
// 이벤트 색상에서 중복 제거, 최대 3개
const colorDots = useMemo(() => {
  const colors = [...new Set(dayEvents.map((e) => e.color))];
  return colors.slice(0, 3);
}, [dayEvents]);
```

날짜 숫자 아래:
```tsx
{colorDots.length > 0 && (
  <div className="flex gap-0.5 justify-center">
    {colorDots.map((c) => (
      <span
        key={c}
        className="w-1 h-1 rounded-full"
        style={{ backgroundColor: c }}
      />
    ))}
  </div>
)}
```

---

## Task 8: 밀린 투두 칩 + 오늘로 이동

**Files:**
- Modify: `packages/web/src/components/features/calendar/calendar-client.tsx`
- Modify: `packages/web/src/lib/actions/todos.ts` (updateTodo에 date 지원 재추가)

**Step 1: updateTodo에 date 필드 지원 추가**

todos.ts의 updateTodo data 타입에 `date?: string` 추가, 검증 포함.

**Step 2: 밀린 투두 계산 + UI**

calendar-client.tsx에서:
```tsx
const overdueTodos = useMemo(() => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return todos.filter((t) => !t.isCompleted && t.date < todayStr);
}, [todos]);
```

투두 카드 상단에 밀린 투두 칩:
```tsx
{overdueTodos.length > 0 && (
  <OverdueTodoChip
    todos={overdueTodos}
    onMoveToToday={(id) => handleTodoDateChange(id, todayStr)}
    onComplete={(id) => handleTodoToggle(id, true)}
  />
)}
```

**Step 3: OverdueTodoChip 컴포넌트**

접이식 칩: 클릭하면 밀린 투두 목록 펼침. 각 항목에 날짜 표시 + "오늘로" 버튼 + 완료 체크.

---

## Task 9: 최종 정리

**Step 1: 타입 체크 + lint**
```bash
pnpm typecheck && pnpm lint
```

**Step 2: 커밋**
```bash
git add <변경 파일들>
git commit -m "feat: 캘린더 푸시알림 + UX 개선 (데일리 요약, 리마인더, 완료 애니메이션, 밀린 투두)"
```
