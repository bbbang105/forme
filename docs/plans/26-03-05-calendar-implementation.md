# 캘린더 전면 리디자인 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Planit 앱 UX를 참고한 캘린더 전면 리디자인 — 시간/장소/카테고리/완료체크 추가, 멀티데이 스패닝 바, 셀 내 이벤트 표시

**Architecture:** DB 스키마에 event_categories 테이블 추가 + calendar_events에 시간/장소/카테고리/완료 컬럼 추가. 월간 그리드를 주(row) 단위 스패닝 바 + 셀 내 이벤트 리스트로 전면 교체. 하단 상세뷰를 Planit 스타일 일정+투두 통합 카드로 리디자인.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, Supabase, shadcn/ui, Tailwind CSS 4, date-fns, @dnd-kit

**Design Doc:** `docs/plans/26-03-05-calendar-redesign.md`

---

## Task 1: event_categories 스키마 생성

**Files:**
- Create: `packages/shared/src/schema/event-categories.ts`
- Modify: `packages/shared/src/schema/index.ts`

**Step 1: 스키마 파일 생성**

```typescript
// packages/shared/src/schema/event-categories.ts
import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const eventCategories = pgTable('event_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull(),
  icon: varchar('icon', { length: 10 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_event_categories_user').on(table.userId, table.sortOrder),
}));
```

**Step 2: index.ts에 export 추가**

`packages/shared/src/schema/index.ts` 라인 4 (`export * from './calendar-events';`) 위에 추가:
```typescript
export * from './event-categories';
```

**Step 3: calendar_events 스키마 수정**

`packages/shared/src/schema/calendar-events.ts` 전체 교체:
```typescript
import { boolean, date, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  startTime: varchar('start_time', { length: 5 }),   // "HH:mm", null = all-day
  endTime: varchar('end_time', { length: 5 }),        // null = 시작시간만
  color: varchar('color', { length: 20 }).notNull().default('#3b82f6'),
  description: text('description'),
  location: varchar('location', { length: 200 }),
  categoryId: uuid('category_id'),                    // FK to event_categories
  isCompleted: boolean('is_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDatesIdx: index('idx_calendar_events_user_dates').on(table.userId, table.startDate, table.endDate),
}));
```

**Step 4: 마이그레이션 생성 및 push**

```bash
cd /Users/hansangho/Desktop/forme
pnpm db:generate
pnpm db:push
```

**Step 5: 커밋**

```bash
git add packages/shared/src/schema/event-categories.ts packages/shared/src/schema/calendar-events.ts packages/shared/src/schema/index.ts
git commit -m "feat: add event_categories table + calendar_events new columns (time, location, category, completed)"
```

---

## Task 2: 카테고리 Server Actions

**Files:**
- Create: `packages/web/src/lib/actions/categories.ts`

**Step 1: 카테고리 CRUD actions 작성**

```typescript
// packages/web/src/lib/actions/categories.ts
'use server';

import { getAuthUser } from '@/lib/auth';
import { traceAction, traceQuery } from '@/lib/logger';
import { eventCategories, db } from '@forme/shared';
import { eq, and, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_CATEGORIES = [
  { name: '업무', color: '#3b82f6', icon: '📋', sortOrder: 0 },
  { name: '개인', color: '#22c55e', icon: '👤', sortOrder: 1 },
  { name: '약속', color: '#f59e0b', icon: '🤝', sortOrder: 2 },
  { name: '공부', color: '#8b5cf6', icon: '📚', sortOrder: 3 },
];

export async function getCategories() {
  return traceAction('getCategories', async () => {
    const user = await getAuthUser();
    let categories = await traceQuery('select_categories', () =>
      db.select().from(eventCategories)
        .where(eq(eventCategories.userId, user.id))
        .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.createdAt))
    );

    // 첫 사용 시 기본 카테고리 자동 생성
    if (categories.length === 0) {
      const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id }));
      categories = await traceQuery('insert_default_categories', () =>
        db.insert(eventCategories).values(rows).returning()
      );
    }

    return categories;
  });
}

export async function createCategory(data: { name: string; color: string; icon: string }) {
  return traceAction('createCategory', async () => {
    const user = await getAuthUser();

    const name = data.name.trim();
    if (!name || name.length > 50) throw new Error('카테고리 이름은 1~50자입니다.');
    if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');
    if (!data.icon || data.icon.length > 10) throw new Error('아이콘을 선택해주세요.');

    // 최대 8개 제한
    const existing = await traceQuery('count_categories', () =>
      db.select().from(eventCategories).where(eq(eventCategories.userId, user.id))
    );
    if (existing.length >= 8) throw new Error('카테고리는 최대 8개까지 생성할 수 있습니다.');

    const maxOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const [created] = await traceQuery('insert_category', () =>
      db.insert(eventCategories).values({
        userId: user.id,
        name,
        color: data.color,
        icon: data.icon,
        sortOrder: maxOrder + 1,
      }).returning()
    );

    revalidatePath('/calendar');
    return created;
  });
}

export async function updateCategory(id: string, data: { name?: string; color?: string; icon?: string; sortOrder?: number }) {
  return traceAction('updateCategory', async () => {
    const user = await getAuthUser();

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || name.length > 50) throw new Error('카테고리 이름은 1~50자입니다.');
      updates.name = name;
    }
    if (data.color !== undefined) {
      if (!HEX_COLOR_REGEX.test(data.color)) throw new Error('올바른 색상 코드가 아닙니다.');
      updates.color = data.color;
    }
    if (data.icon !== undefined) {
      if (!data.icon || data.icon.length > 10) throw new Error('아이콘을 선택해주세요.');
      updates.icon = data.icon;
    }
    if (data.sortOrder !== undefined) {
      updates.sortOrder = data.sortOrder;
    }

    if (Object.keys(updates).length === 0) return;

    const [updated] = await traceQuery('update_category', () =>
      db.update(eventCategories).set(updates)
        .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, user.id)))
        .returning()
    );

    revalidatePath('/calendar');
    return updated;
  });
}

export async function deleteCategory(id: string) {
  return traceAction('deleteCategory', async () => {
    const user = await getAuthUser();
    await traceQuery('delete_category', () =>
      db.delete(eventCategories)
        .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, user.id)))
    );
    revalidatePath('/calendar');
  });
}

export async function reorderCategories(orderedIds: string[]) {
  return traceAction('reorderCategories', async () => {
    const user = await getAuthUser();
    await Promise.all(
      orderedIds.map((id, index) =>
        traceQuery(`reorder_category_${index}`, () =>
          db.update(eventCategories).set({ sortOrder: index })
            .where(and(eq(eventCategories.id, id), eq(eventCategories.userId, user.id)))
        )
      )
    );
    revalidatePath('/calendar');
  });
}
```

**Step 2: 커밋**

```bash
git add packages/web/src/lib/actions/categories.ts
git commit -m "feat: add event category CRUD server actions with auto-init defaults"
```

---

## Task 3: calendar Server Actions 수정 (시간/장소/카테고리/완료)

**Files:**
- Modify: `packages/web/src/lib/actions/calendar.ts`

**Step 1: Server Actions 업데이트**

`getCalendarEvents` 반환에 새 필드 포함 (Drizzle select는 자동 포함).

`createCalendarEvent` data 인터페이스에 추가:
- `startTime?: string | null` — `/^\d{2}:\d{2}$/` 검증
- `endTime?: string | null`
- `location?: string | null` — max 200
- `categoryId?: string | null`
- `isCompleted?: boolean`

`updateCalendarEvent`에 동일 필드 추가.

새 action 추가:
- `toggleCalendarEvent(id: string)` — `is_completed` atomic flip (투두의 `toggleTodo` 패턴)

**Step 2: TIME_REGEX 추가**

기존 라인 9-11의 regex 블록에 추가:
```typescript
const TIME_REGEX = /^\d{2}:\d{2}$/;
```

**Step 3: createCalendarEvent 수정**

기존 data 파라미터 타입을 확장하고 검증 추가:
```typescript
// 시간 검증 (있을 때만)
if (data.startTime !== undefined && data.startTime !== null) {
  if (!TIME_REGEX.test(data.startTime)) throw new Error('시작 시간 형식이 올바르지 않습니다.');
}
if (data.endTime !== undefined && data.endTime !== null) {
  if (!TIME_REGEX.test(data.endTime)) throw new Error('종료 시간 형식이 올바르지 않습니다.');
}
// 장소 검증
if (data.location && data.location.length > 200) throw new Error('장소는 200자 이하로 입력해주세요.');
```

insert values에 새 필드 추가:
```typescript
startTime: data.startTime || null,
endTime: data.endTime || null,
location: data.location || null,
categoryId: data.categoryId || null,
isCompleted: data.isCompleted ?? false,
```

**Step 4: toggleCalendarEvent 새 action**

```typescript
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
```

import에 `sql` 추가 필요.

**Step 5: 커밋**

```bash
git add packages/web/src/lib/actions/calendar.ts
git commit -m "feat: extend calendar actions with time, location, category, completion toggle"
```

---

## Task 4: shadcn/ui Switch 컴포넌트 추가

**Files:**
- Create: `packages/web/src/components/ui/switch.tsx`

**Step 1: shadcn switch 설치**

```bash
cd /Users/hansangho/Desktop/forme/packages/web
pnpm dlx shadcn@latest add switch
```

**Step 2: 커밋**

```bash
git add packages/web/src/components/ui/switch.tsx
git commit -m "feat: add shadcn/ui Switch component"
```

---

## Task 5: CalendarEvent 타입 및 인터페이스 통합

**Files:**
- Create: `packages/web/src/components/features/calendar/types.ts`

**Step 1: 공통 타입 파일 생성**

현재 `CalendarEvent`와 `Todo` 인터페이스가 `calendar-client.tsx`, `calendar-grid.tsx`, `event-list.tsx`, `event-form.tsx`에 각각 중복 선언됨. 새 필드 추가와 함께 하나로 통합.

```typescript
// packages/web/src/components/features/calendar/types.ts
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  color: string;
  description: string | null;
  location: string | null;
  categoryId: string | null;
  isCompleted: boolean;
}

export interface Todo {
  id: string;
  date: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}
```

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/calendar/types.ts
git commit -m "feat: create shared calendar types (CalendarEvent, Todo, EventCategory)"
```

---

## Task 6: CalendarGrid 전면 재작성 — 멀티데이 스패닝 바 + 셀 내 이벤트

**Files:**
- Modify: `packages/web/src/components/features/calendar/calendar-grid.tsx` (전면 재작성)

이것이 가장 핵심적이고 복잡한 태스크. 아래 로직을 구현:

**Step 1: 멀티데이 이벤트 스패닝 계산 유틸**

주(week row) 단위로 멀티데이 이벤트를 슬롯에 배치하는 `computeSpanningEvents` 함수:

```typescript
interface SpanSlot {
  event: CalendarEvent;
  startCol: number;  // 0-6 (일-토)
  endCol: number;    // 0-6
  isStart: boolean;  // 이벤트의 실제 시작이 이 주에 있는지
  isEnd: boolean;    // 이벤트의 실제 끝이 이 주에 있는지
}

function computeSpanningEvents(
  weekDays: Date[],         // 해당 주의 7일
  multiDayEvents: CalendarEvent[], // startDate !== endDate인 이벤트들
): SpanSlot[][] {
  // 최대 2줄 슬롯
  // 각 이벤트가 이 주에서 차지하는 col 범위 계산
  // 슬롯 greedy 할당 (첫 번째 빈 row에 배치)
  // 2줄 초과 시 overflow 처리
}
```

**Step 2: DayCell 재작성**

기존 중앙 숫자 + 점 방식 → 좌상단 숫자 + 아래로 이벤트 리스트:

```tsx
const DayCell = React.memo(function DayCell({ ... }: DayCellProps) {
  return (
    <button className="flex flex-col items-start p-1 min-h-[72px] sm:min-h-[90px] ...">
      {/* 날짜 숫자 — 좌상단 */}
      <span className={cn('w-6 h-6 text-xs rounded-full flex items-center justify-center', ...)}>
        {day}
      </span>

      {/* 단일 이벤트 리스트 (최대 2개) */}
      <div className="w-full space-y-0.5 mt-0.5">
        {singleDayEvents.slice(0, 2).map(event => (
          <div key={event.id} className="flex items-center gap-0.5 text-[11px] truncate">
            <span className="w-0.5 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
            <span className="truncate">
              {event.startTime && <span className="text-muted-foreground">{event.startTime} </span>}
              {event.title}
            </span>
          </div>
        ))}
        {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}개</span>}
      </div>

      {/* 투두 인디케이터 — 우하단 */}
      {incompleteTodos > 0 && (
        <span className="mt-auto self-end text-[10px] text-primary flex items-center gap-0.5">
          <span className="w-1 h-1 rounded-full bg-primary" />
          {incompleteTodos > 1 && incompleteTodos}
        </span>
      )}
    </button>
  );
});
```

**Step 3: WeekRow 컴포넌트 — 스패닝 바 + 셀 행**

각 주를 별도 컴포넌트로:

```tsx
function WeekRow({ days, spanSlots, ... }: WeekRowProps) {
  return (
    <div className="relative">
      {/* 스패닝 바 오버레이 (absolute positioned) */}
      <div className="relative" style={{ minHeight: `${spanSlots.length * 20}px` }}>
        {spanSlots.map((row, rowIdx) =>
          row.map((slot) => (
            <div
              key={slot.event.id}
              className={cn(
                'absolute h-[18px] text-[11px] flex items-center px-1 truncate',
                slot.isStart && 'rounded-l-sm',
                slot.isEnd && 'rounded-r-sm',
              )}
              style={{
                left: `${(slot.startCol / 7) * 100}%`,
                width: `${((slot.endCol - slot.startCol + 1) / 7) * 100}%`,
                top: `${rowIdx * 20}px`,
                backgroundColor: `${slot.event.color}20`,  // 15% opacity (hex)
                color: slot.event.color,
              }}
            >
              {slot.isStart && <span className="mr-0.5">{getCategoryIcon(slot.event)}</span>}
              <span className="truncate font-medium">{slot.event.title}</span>
            </div>
          ))
        )}
      </div>

      {/* 7개 DayCell */}
      <div className="grid grid-cols-7">
        {days.map((day) => <DayCell key={day.toISOString()} ... />)}
      </div>
    </div>
  );
}
```

**Step 4: CalendarGrid 메인 — 주 단위로 분할**

```tsx
export function CalendarGrid({ currentMonth, selectedDate, onSelectDate, events, todos, categories }: CalendarGridProps) {
  // calendarDays 계산 (기존)
  // weeks: calendarDays를 7개씩 chunk
  // multiDayEvents, singleDayEvents 분리
  // 각 week에 대해 spanSlots 계산 (useMemo)

  return (
    <div>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {['일','월','화','수','목','금','토'].map(...)}
      </div>

      {/* 주 단위 렌더 */}
      {weeks.map((weekDays, i) => (
        <WeekRow key={i} days={weekDays} spanSlots={...} ... />
      ))}
    </div>
  );
}
```

props에 `categories: EventCategory[]` 추가 (아이콘 표시용).

**Step 5: 커밋**

```bash
git add packages/web/src/components/features/calendar/calendar-grid.tsx
git commit -m "feat: redesign calendar grid with multi-day spanning bars and inline event display"
```

---

## Task 7: EventForm 리디자인 (카테고리/시간/장소/종일토글)

**Files:**
- Modify: `packages/web/src/components/features/calendar/event-form.tsx` (전면 재작성)

**Step 1: 폼 구조 재작성**

주요 변경:
- 카테고리 칩 선택 UI (가로 스크롤)
- 종일/시간 Switch 토글
- 시간 인풋 (`type="time"`) — 종일 off일 때만 표시
- 장소 인풋
- 카테고리 선택 시 색상 자동 세팅
- 새 CalendarEvent 타입 사용 (`types.ts`에서 import)

```tsx
// 핵심 state 추가
const [isAllDay, setIsAllDay] = useState(!event?.startTime);
const [startTime, setStartTime] = useState(event?.startTime || '09:00');
const [endTime, setEndTime] = useState(event?.endTime || '10:00');
const [location, setLocation] = useState(event?.location || '');
const [categoryId, setCategoryId] = useState(event?.categoryId || null);
```

카테고리 칩:
```tsx
<div className="flex gap-2 overflow-x-auto pb-1">
  {categories.map((cat) => (
    <button
      key={cat.id}
      type="button"
      onClick={() => {
        setCategoryId(cat.id);
        setColor(cat.color);  // 자동 색상 세팅
      }}
      className={cn(
        'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-all',
        categoryId === cat.id
          ? 'ring-2 ring-offset-1'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      )}
      style={categoryId === cat.id ? {
        borderColor: cat.color,
        backgroundColor: `${cat.color}15`,
        ringColor: cat.color,
      } : undefined}
    >
      <span>{cat.icon}</span>
      <span>{cat.name}</span>
    </button>
  ))}
</div>
```

종일 토글:
```tsx
<div className="flex items-center justify-between">
  <Label>종일</Label>
  <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
</div>

{!isAllDay && (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label className="text-xs text-muted-foreground">시작 시간</Label>
      <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
    </div>
    <div>
      <Label className="text-xs text-muted-foreground">종료 시간</Label>
      <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
    </div>
  </div>
)}
```

props에 `categories: EventCategory[]` 추가.

submit 시 새 필드 전달:
```typescript
const eventData = {
  title,
  startDate,
  endDate,
  startTime: isAllDay ? null : startTime,
  endTime: isAllDay ? null : endTime,
  color,
  description: description || null,
  location: location || null,
  categoryId,
};
```

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/calendar/event-form.tsx
git commit -m "feat: redesign event form with category chips, time toggle, location field"
```

---

## Task 8: EventList → 상세뷰 리디자인 (Planit 스타일)

**Files:**
- Modify: `packages/web/src/components/features/calendar/event-list.tsx` (전면 재작성)

**Step 1: 일정 카드 리디자인**

기존 간단한 리스트 → 체크 가능한 카드 형태:

```tsx
export function EventList({ events, selectedDate, categories, onEdit, onToggle }: EventListProps) {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayEvents = events
    .filter((e) => e.startDate <= dateStr && e.endDate >= dateStr)
    .sort((a, b) => {
      // 미완료 먼저, 그 다음 시간순
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });

  if (dayEvents.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1">일정</p>
      {dayEvents.map((event) => {
        const category = categories.find((c) => c.id === event.categoryId);
        return (
          <div
            key={event.id}
            className={cn(
              'flex items-start gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card transition-all',
              event.isCompleted && 'opacity-50'
            )}
          >
            {/* 완료 체크 */}
            <button
              onClick={() => onToggle(event.id, !event.isCompleted)}
              className="mt-0.5 shrink-0"
            >
              {event.isCompleted
                ? <CheckCircle2 className="h-4.5 w-4.5 text-primary" />
                : <Circle className="h-4.5 w-4.5 text-muted-foreground/40" />
              }
            </button>

            {/* 카테고리 색상 바 + 내용 */}
            <div
              className="flex-1 min-w-0 border-l-[3px] pl-2.5"
              style={{ borderColor: event.color }}
            >
              {/* 시간 */}
              <p className="text-xs text-muted-foreground">
                {event.startTime
                  ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
                  : '종일'}
                {event.startDate !== event.endDate && (
                  <span className="ml-1">
                    ({format(new Date(event.startDate + 'T00:00:00'), 'M.d')} - {format(new Date(event.endDate + 'T00:00:00'), 'M.d')})
                  </span>
                )}
              </p>

              {/* 제목 */}
              <p className={cn('text-sm font-medium', event.isCompleted && 'line-through')}>
                {category && <span className="mr-1">{category.icon}</span>}
                {event.title}
              </p>

              {/* 장소 */}
              {event.location && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </p>
              )}
            </div>

            {/* 편집 */}
            <button
              onClick={() => onEdit(event)}
              className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

props에 `categories: EventCategory[]`과 `onToggle: (id: string, isCompleted: boolean) => void` 추가.

**Step 2: 빈 상태 컴포넌트**

일정과 투두 모두 없을 때 표시할 빈 상태를 `calendar-client.tsx`에서 조건부 렌더:

```tsx
// 일정 0 + 투두 0일 때
const emptyMessages = [
  '오늘은 여유로운 하루!',
  '한가한 하루네요',
  '일정이 없는 날이에요',
  '자유로운 하루를 보내세요',
  '오늘은 쉬어가는 날',
];
```

**Step 3: 커밋**

```bash
git add packages/web/src/components/features/calendar/event-list.tsx
git commit -m "feat: redesign event list with completion toggle, time display, location, category icons"
```

---

## Task 9: CalendarClient 통합 — 카테고리 fetch + 완료 토글 + 새 props 전달

**Files:**
- Modify: `packages/web/src/components/features/calendar/calendar-client.tsx`

**Step 1: 카테고리 state + fetch 추가**

```typescript
import { getCategories } from '@/lib/actions/categories';
import { toggleCalendarEvent } from '@/lib/actions/calendar';
import type { CalendarEvent, Todo, EventCategory } from './types';

// state 추가
const [categories, setCategories] = useState<EventCategory[]>([]);

// fetchData에 카테고리 추가
const [eventsData, todosData, categoriesData] = await Promise.all([
  getCalendarEvents(month),
  getTodosByDateRange(...),
  getCategories(),
]);
setCategories(categoriesData as EventCategory[]);
```

**Step 2: 이벤트 완료 토글 콜백**

```typescript
const handleEventToggle = useCallback((eventId: string, isCompleted: boolean) => {
  // Optimistic
  setEvents((prev) =>
    prev.map((e) => (e.id === eventId ? { ...e, isCompleted } : e))
  );
  // Server
  toggleCalendarEvent(eventId).catch(() => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, isCompleted: !isCompleted } : e))
    );
  });
}, []);
```

**Step 3: 자식 컴포넌트에 새 props 전달**

```tsx
<CalendarGrid ... categories={categories} />
<EventList ... categories={categories} onToggle={handleEventToggle} />
<EventForm ... categories={categories} />
```

**Step 4: 빈 상태 렌더링**

```tsx
{dayEvents.length === 0 && totalCount === 0 && (
  <Card className="p-6 text-center">
    <p className="text-2xl mb-1">(◕‿◕)</p>
    <p className="text-sm text-muted-foreground">
      {emptyMessages[selectedDate.getDate() % emptyMessages.length]}
    </p>
    <Button variant="outline" size="sm" className="mt-3" onClick={handleAddEvent}>
      <Plus className="h-3.5 w-3.5 mr-1" />
      일정 추가
    </Button>
  </Card>
)}
```

**Step 5: CalendarEvent 인터페이스를 types.ts에서 import하도록 변경**

기존 inline 인터페이스 정의 제거, `import type { CalendarEvent, Todo, EventCategory } from './types'` 사용.

**Step 6: 커밋**

```bash
git add packages/web/src/components/features/calendar/calendar-client.tsx
git commit -m "feat: integrate categories, event toggle, empty state into calendar client"
```

---

## Task 10: TodoList 스타일 통일

**Files:**
- Modify: `packages/web/src/components/features/calendar/todo-list.tsx`

**Step 1: TodoItem 스타일을 EventList 카드와 통일**

기존 동작(optimistic, IME) 유지하면서 스타일만 변경:
- 체크 원형: `Circle` / `CheckCircle2` (EventList와 동일)
- 완료: 취소선 + `opacity-50`
- 완료 항목 접이식: "완료 N개" 토글

```tsx
const [showCompleted, setShowCompleted] = useState(false);

// completed 섹션
{completed.length > 0 && (
  <button
    onClick={() => setShowCompleted(!showCompleted)}
    className="text-xs text-muted-foreground flex items-center gap-1 px-1 py-1"
  >
    <ChevronRight className={cn('h-3 w-3 transition-transform', showCompleted && 'rotate-90')} />
    완료 {completed.length}개
  </button>
)}
{showCompleted && completed.map(...)}
```

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/calendar/todo-list.tsx
git commit -m "feat: unify todo list style with event cards, add collapsible completed section"
```

---

## Task 11: 카테고리 관리 다이얼로그

**Files:**
- Create: `packages/web/src/components/features/calendar/category-manager.tsx`

**Step 1: 카테고리 관리 UI 구현**

```tsx
// Dialog with:
// - 카테고리 목록 (emoji + name input + color picker + drag handle)
// - dnd-kit sortable로 드래그 순서 변경
// - + 카테고리 추가 버튼
// - 삭제 (X 아이콘)
// - emoji 선택: 간단한 popover grid (자주 쓰는 emoji 16개)

const COMMON_EMOJIS = ['📋','👤','🤝','📚','🏠','💼','🎮','🏃','🍽️','✈️','💰','🎵','🔧','❤️','⭐','🎯'];

const CATEGORY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#f43f5e', '#06b6d4', '#6b7280',
];
```

EventForm에서 카테고리 칩 옆 `설정` 버튼으로 진입.

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/calendar/category-manager.tsx
git commit -m "feat: add category manager dialog with drag reorder, emoji picker, color selection"
```

---

## Task 12: 대시보드 캘린더 위젯 업데이트

**Files:**
- Modify: `packages/web/src/components/features/calendar/dashboard-calendar.tsx`

**Step 1: 새 필드 반영**

- 이벤트에 시간 표시 (`startTime` 있으면 `10:00 미팅` 형태)
- 카테고리 색상 반영 (좌측 바)
- 완료된 이벤트는 표시 안 함 또는 취소선
- select에 새 컬럼 포함

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/calendar/dashboard-calendar.tsx
git commit -m "feat: update dashboard calendar widget with time display and category colors"
```

---

## Task 13: globals.css 애니메이션 추가

**Files:**
- Modify: `packages/web/src/app/globals.css`

**Step 1: 새 애니메이션 키프레임 추가**

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fade-in 0.15s ease-out;
}
```

**Step 2: 커밋**

```bash
git add packages/web/src/app/globals.css
git commit -m "feat: add fade-in animation for calendar detail view transitions"
```

---

## Task 14: 타입 체크 + 빌드 확인

**Step 1: 타입 체크**

```bash
cd /Users/hansangho/Desktop/forme
pnpm typecheck
```

모든 타입 에러 수정.

**Step 2: 빌드**

```bash
pnpm build
```

빌드 에러 수정.

**Step 3: 커밋 (수정 있으면)**

```bash
git add -p  # 변경된 파일만 선택
git commit -m "fix: resolve type errors and build issues from calendar redesign"
```

---

## Task 15: 테스트 업데이트

**Files:**
- Modify: `packages/web/src/__tests__/` 내 캘린더 관련 테스트

**Step 1: 기존 테스트 확인 및 수정**

```bash
pnpm test
```

새 필드(startTime, endTime, location, categoryId, isCompleted) 때문에 깨지는 테스트 수정.
카테고리 actions 테스트 추가.

**Step 2: 커밋**

```bash
git add packages/web/src/__tests__/
git commit -m "test: update calendar tests for new fields, add category action tests"
```

---

## 실행 순서 요약

| # | Task | 의존성 |
|---|------|--------|
| 1 | 스키마 변경 + 마이그레이션 | 없음 |
| 2 | 카테고리 Server Actions | Task 1 |
| 3 | Calendar Actions 수정 | Task 1 |
| 4 | Switch 컴포넌트 추가 | 없음 |
| 5 | 공통 타입 파일 | 없음 |
| 6 | CalendarGrid 재작성 | Task 1, 5 |
| 7 | EventForm 리디자인 | Task 1, 4, 5 |
| 8 | EventList 리디자인 | Task 1, 5 |
| 9 | CalendarClient 통합 | Task 2, 3, 5, 6, 7, 8 |
| 10 | TodoList 스타일 통일 | Task 5 |
| 11 | 카테고리 관리 다이얼로그 | Task 2, 5 |
| 12 | 대시보드 위젯 업데이트 | Task 1 |
| 13 | CSS 애니메이션 | 없음 |
| 14 | 타입체크 + 빌드 | All above |
| 15 | 테스트 | All above |

**병렬 가능 그룹:**
- Group A (독립): Task 1, 4, 5, 13
- Group B (Task 1 후): Task 2, 3, 12
- Group C (Task 1+5 후): Task 6, 7, 8, 10, 11
- Group D (모두 후): Task 9, 14, 15
