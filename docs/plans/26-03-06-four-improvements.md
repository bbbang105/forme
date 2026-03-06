# 4가지 개선사항 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 캘린더 반복 일정, 모바일 줌 제거, 읽은 글 정렬, 메모 캐싱 개선 4가지 구현

**Architecture:** 각 기능이 독립적이므로 순서대로 구현. DB 스키마 변경(반복 일정)부터 시작하여, UI 수정(줌), API 수정(정렬), 캐싱 수정 순서로 진행.

**Tech Stack:** Drizzle ORM, Next.js 16, Tailwind CSS 4, shadcn/ui

---

## Task 1: 모바일 자동 확대 제거 - Viewport 메타태그

**Files:**
- Modify: `packages/web/src/app/layout.tsx`

**Step 1: viewport export 추가**

`layout.tsx`에 Next.js 16 방식의 viewport export 추가:

```typescript
import type {Metadata, Viewport} from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
```

**Step 2: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/forme && pnpm build`
Expected: 빌드 성공

---

## Task 2: 모바일 자동 확대 제거 - Input 컴포넌트 16px

**Files:**
- Modify: `packages/web/src/components/ui/input.tsx`

**Step 1: text-sm -> text-base 변경**

`input.tsx`의 className에서 `text-sm` -> `text-base` 변경. iOS는 font-size < 16px인 input focus 시 자동 줌.

```typescript
'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background ...'
```

---

## Task 3: 모바일 자동 확대 제거 - 개별 컴포넌트 수정

**Files:**
- Modify: `packages/web/src/components/features/calendar/event-form.tsx:358-365` (textarea text-sm -> text-base)
- Modify: `packages/web/src/components/features/calendar/todo-list.tsx` (input text-sm -> text-base)
- Modify: `packages/web/src/components/features/curation/curation-search.tsx` (input text-sm -> text-base)
- Modify: `packages/web/src/components/features/curation/source-manager.tsx` (date input text-sm -> text-base)
- Modify: `packages/web/src/components/features/memo/memo-list.tsx:191` (search input text-sm -> text-base)
- Modify: `packages/web/src/components/features/memo/code-block-view.tsx` (select 폰트 확인)
- Modify: `packages/web/src/app/globals.css` (TipTap `.tiptap` font-size: 0.9375rem -> 1rem, `.code-block-lang-select` font-size: 0.7rem -> 1rem)

**Step 1: 모든 input/textarea/select에서 text-sm 또는 font-size < 16px 부분을 text-base 또는 1rem으로 변경**

핵심 변경:
- `event-form.tsx` line 364: textarea의 `text-sm` -> `text-base`
- `todo-list.tsx`: input의 `text-sm` -> `text-base`
- `curation-search.tsx`: input의 `text-sm` -> `text-base`
- `source-manager.tsx`: date input의 `text-sm` -> `text-base`
- `memo-list.tsx` line 191: search input의 `text-sm` -> `text-base`
- `globals.css`: `.tiptap { font-size: 1rem; }`, `.code-block-lang-select { font-size: 1rem; }`

**Step 2: 커밋**

```bash
git add packages/web/src/app/layout.tsx packages/web/src/components/ui/input.tsx packages/web/src/components/features/calendar/event-form.tsx packages/web/src/components/features/calendar/todo-list.tsx packages/web/src/components/features/curation/curation-search.tsx packages/web/src/components/features/curation/source-manager.tsx packages/web/src/components/features/memo/memo-list.tsx packages/web/src/components/features/memo/code-block-view.tsx packages/web/src/app/globals.css
git commit -m "fix: 모바일 PWA 자동 확대 제거 - viewport + input 16px 확보"
```

---

## Task 4: 읽은 글 최근 읽은 순 정렬

**Files:**
- Modify: `packages/web/src/app/api/curation/route.ts`

**Step 1: status=read일 때 readAt DESC 정렬**

`GET /api/curation`에서 `status === 'read'`일 때:
- sortDate 표현식을 `readAt`으로 교체
- cursor도 `readAt` 기반으로 전환

변경 위치: route.ts의 latest sort 쿼리 부분 (line 338~)

```typescript
// status=read일 때 readAt 기준 정렬
const isReadSort = status === 'read';
const sortDateExpr = isReadSort
  ? curationItems.readAt
  : sql`COALESCE(${curationItems.publishedAt}, ${curationItems.collectedAt})`;
```

cursor 파싱/생성 로직도 동일하게 sortDateExpr 사용하므로 자동 적용.

recommended 정렬에서도 status=read일 때 readAt 기반으로 동작하도록 scoreExpr 내 sortDate 교체.

**Step 2: readAt 인덱스 추가 (마이그레이션)**

`packages/shared/src/schema/curation-items.ts`에 readAt 인덱스 추가:

```typescript
readAtIdx: index('idx_items_read_at').on(table.readAt),
```

**Step 3: 커밋**

```bash
git add packages/web/src/app/api/curation/route.ts packages/shared/src/schema/curation-items.ts
git commit -m "feat: 읽은 글 탭 최근 읽은 순(readAt DESC) 정렬"
```

---

## Task 5: 캘린더 반복 일정 - DB 스키마

**Files:**
- Modify: `packages/shared/src/schema/calendar-events.ts`

**Step 1: 반복 필드 추가**

```typescript
import {boolean, date, index, pgTable, text, timestamp, uuid, varchar, integer} from 'drizzle-orm/pg-core';

export const calendarEvents = pgTable('calendar_events', {
  // ... 기존 필드 유지 ...

  // 반복 일정 필드
  recurrenceType: varchar('recurrence_type', { length: 10 }),  // 'weekly' | 'biweekly' | null
  recurrenceDays: integer('recurrence_days').array(),           // [0=일, 1=월, ..., 6=토]
  recurrenceEndDate: date('recurrence_end_date'),               // 반복 종료일
  parentEventId: uuid('parent_event_id'),                       // null=마스터 또는 단일, 값=예외 인스턴스
  excludedDates: date('excluded_dates').array(),                 // 삭제된 날짜 목록
}, (table) => ({
  userDatesIdx: index('idx_calendar_events_user_dates').on(table.userId, table.startDate, table.endDate),
  parentIdx: index('idx_calendar_events_parent').on(table.parentEventId),
}));
```

**Step 2: 마이그레이션 생성 및 push**

Run: `cd /Users/hansangho/Desktop/forme && pnpm db:push`
Expected: 스키마 변경 적용

---

## Task 6: 캘린더 반복 일정 - 타입 정의

**Files:**
- Modify: `packages/web/src/components/features/calendar/types.ts`

**Step 1: CalendarEvent 타입에 반복 필드 추가**

```typescript
export interface CalendarEvent {
  // ... 기존 필드 ...
  recurrenceType: string | null;    // 'weekly' | 'biweekly' | null
  recurrenceDays: number[] | null;  // [0-6]
  recurrenceEndDate: string | null; // YYYY-MM-DD
  parentEventId: string | null;
  excludedDates: string[] | null;
}
```

---

## Task 7: 캘린더 반복 일정 - Server Actions

**Files:**
- Modify: `packages/web/src/lib/actions/calendar.ts`

**Step 1: createCalendarEvent에 반복 필드 추가**

입력 데이터에 `recurrenceType`, `recurrenceDays`, `recurrenceEndDate` 추가.
검증 로직:
- recurrenceType이 있으면 recurrenceDays 필수 (1개 이상 요일)
- recurrenceDays는 0-6 범위
- recurrenceEndDate는 startDate 이후
- recurrenceType 없으면 나머지 반복 필드 무시

**Step 2: getCalendarEvents에 반복 인스턴스 확장 로직**

조회 시 반복 이벤트를 해당 월의 날짜별 가상 인스턴스로 확장:

```typescript
function expandRecurringEvents(events: CalendarEvent[], rangeStart: string, rangeEnd: string): CalendarEvent[] {
  const result: CalendarEvent[] = [];

  for (const event of events) {
    if (!event.recurrenceType) {
      result.push(event);
      continue;
    }

    // 반복 마스터: 범위 내 각 해당 요일에 인스턴스 생성
    const excluded = new Set(event.excludedDates ?? []);
    const start = new Date(rangeStart);
    const end = new Date(event.recurrenceEndDate ?? rangeEnd);
    const actualEnd = end < new Date(rangeEnd) ? end : new Date(rangeEnd);
    const step = event.recurrenceType === 'biweekly' ? 14 : 7;

    // 시작점: event.startDate부터 step일 간격으로
    const eventStart = new Date(event.startDate);
    const days = event.recurrenceDays ?? [];

    let current = new Date(Math.max(eventStart.getTime(), start.getTime()));
    // 주 시작일로 정렬
    current.setDate(current.getDate() - current.getDay());

    while (current <= actualEnd) {
      for (const dayOfWeek of days) {
        const instanceDate = new Date(current);
        instanceDate.setDate(instanceDate.getDate() + dayOfWeek);
        const dateStr = instanceDate.toISOString().split('T')[0];

        if (instanceDate >= eventStart && instanceDate <= actualEnd && instanceDate >= start && !excluded.has(dateStr)) {
          // 격주 체크: startDate 기준 주 차이가 짝수여야 함
          if (event.recurrenceType === 'biweekly') {
            const weekDiff = Math.floor((instanceDate.getTime() - eventStart.getTime()) / (7 * 86400000));
            if (weekDiff % 2 !== 0) continue;
          }

          result.push({
            ...event,
            id: `${event.id}_${dateStr}`,  // 가상 ID
            startDate: dateStr,
            endDate: dateStr,
            _originalId: event.id,          // 원본 ID 참조
            _instanceDate: dateStr,         // 인스턴스 날짜
          });
        }
      }
      current.setDate(current.getDate() + 7);
    }
  }

  return result;
}
```

**Step 3: 삭제 액션 추가 - excludeRecurringDate, deleteRecurringAfter**

```typescript
// 이 날짜만 삭제 (excludedDates에 추가)
export async function excludeRecurringDate(eventId: string, dateStr: string)

// 이후 모든 일정 삭제 (recurrenceEndDate 변경)
export async function deleteRecurringAfter(eventId: string, dateStr: string)

// 모든 반복 삭제 (마스터 자체 삭제) - 기존 deleteCalendarEvent 사용
```

---

## Task 8: 캘린더 반복 일정 - EventForm UI

**Files:**
- Modify: `packages/web/src/components/features/calendar/event-form.tsx`

**Step 1: 반복 설정 UI 추가**

이벤트 폼에 "종일" 토글 아래에 반복 설정 추가:
- "반복" 토글 (Switch)
- 반복 타입: "매주" / "격주" 선택 (2개 버튼)
- 요일 선택: 일~토 7개 칩 버튼 (다중 선택)
- 종료일: date input ("반복 종료일")

```tsx
{/* 반복 설정 */}
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <Label className="text-sm">반복</Label>
    <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
  </div>

  {isRecurring && (
    <div className="space-y-3 animate-fade-in">
      {/* 매주/격주 */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setRecurrenceType('weekly')}
          className={cn('px-3 py-1.5 rounded-full text-xs border', recurrenceType === 'weekly' ? 'bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
          매주
        </button>
        <button type="button" onClick={() => setRecurrenceType('biweekly')}
          className={cn('px-3 py-1.5 rounded-full text-xs border', recurrenceType === 'biweekly' ? 'bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
          격주
        </button>
      </div>

      {/* 요일 선택 */}
      <div className="flex gap-1.5">
        {['일','월','화','수','목','금','토'].map((label, i) => (
          <button key={i} type="button"
            onClick={() => toggleDay(i)}
            className={cn('w-8 h-8 rounded-full text-xs font-medium',
              recurrenceDays.includes(i) ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {/* 종료일 */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">반복 종료일</Label>
        <Input type="date" value={recurrenceEndDate} onChange={...} min={startDate} />
      </div>
    </div>
  )}
</div>
```

**Step 2: handleSubmit에 반복 데이터 포함**

eventData에 `recurrenceType`, `recurrenceDays`, `recurrenceEndDate` 추가.

---

## Task 9: 캘린더 반복 일정 - 삭제 다이얼로그

**Files:**
- Modify: `packages/web/src/components/features/calendar/event-form.tsx`
- Modify: `packages/web/src/components/features/calendar/event-list.tsx`

**Step 1: 반복 이벤트 삭제 시 3개 옵션 다이얼로그**

기존 AlertDialog를 반복 이벤트인 경우 확장:

```tsx
{event?.recurrenceType ? (
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>반복 일정 삭제</AlertDialogTitle>
      <AlertDialogDescription>
        &ldquo;{event?.title}&rdquo; 반복 일정을 어떻게 삭제하시겠습니까?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="flex flex-col gap-2 py-2">
      <Button variant="outline" size="sm" onClick={handleDeleteThisOnly}>
        이 일정만 삭제
      </Button>
      <Button variant="outline" size="sm" onClick={handleDeleteAfter}>
        이후 모든 일정 삭제
      </Button>
      <Button variant="destructive" size="sm" onClick={handleDeleteAll}>
        모든 반복 일정 삭제
      </Button>
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
    </AlertDialogFooter>
  </AlertDialogContent>
) : (
  // 기존 단일 삭제 다이얼로그
)}
```

**Step 2: calendar-client.tsx에 삭제 핸들러 연결**

`handleEventDelete`에서 반복 이벤트 가상 ID(`eventId_dateStr`) 파싱하여 적절한 액션 호출.

**Step 3: 커밋**

```bash
git add packages/shared/src/schema/calendar-events.ts packages/web/src/components/features/calendar/types.ts packages/web/src/lib/actions/calendar.ts packages/web/src/components/features/calendar/event-form.tsx packages/web/src/components/features/calendar/event-list.tsx packages/web/src/components/features/calendar/calendar-client.tsx
git commit -m "feat: 캘린더 반복 일정 (매주/격주 + 요일 선택 + 삭제 옵션)"
```

---

## Task 10: 메모 캐싱 개선 - 에디터 뒤로가기

**Files:**
- Modify: `packages/web/src/components/features/memo/memo-editor.tsx:340-359`

**Step 1: router.push 전에 router.refresh() 호출**

Next.js 클라이언트 라우터 캐시로 인해 뒤로가기 시 stale 데이터 표시 문제.
`handleBack`과 `handleDelete`에서 `router.refresh()` 추가:

```typescript
const handleBack = useCallback(async () => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  if (blurHandlerRef.current) {
    window.removeEventListener('blur', blurHandlerRef.current);
    blurHandlerRef.current = null;
  }

  if (!title.trim() && (!editor || editor.isEmpty)) {
    await deleteMemo(memo.id);
  } else {
    const ok = await save();
    if (!ok) return;
  }

  router.refresh();
  router.push('/memo');
}, [editor, memo.id, title, save, router]);

const handleDelete = useCallback(async () => {
  await deleteMemo(memo.id);
  router.refresh();
  router.push('/memo');
}, [memo.id, router]);
```

---

## Task 11: 메모 캐싱 개선 - 리스트 마운트 시 최신 데이터

**Files:**
- Modify: `packages/web/src/components/features/memo/memo-list.tsx`

**Step 1: initialMemos 변경 시 state 동기화**

MemoList가 서버에서 새 initialMemos를 받을 때 state를 업데이트하도록:

```typescript
// initialMemos가 변경되면 (서버에서 새 데이터 전달 시) state 동기화
useEffect(() => {
  setMemos(initialMemos);
  setHasMore(initialHasMore);
  setNextOffset(initialNextOffset);
}, [initialMemos, initialHasMore, initialNextOffset]);
```

**Step 2: 커밋**

```bash
git add packages/web/src/components/features/memo/memo-editor.tsx packages/web/src/components/features/memo/memo-list.tsx
git commit -m "fix: 메모 저장 후 목록 캐싱 문제 해결 - router.refresh + state 동기화"
```

---

## Task 12: 최종 빌드 & 타입체크

**Step 1: 타입체크**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: 에러 없음

**Step 2: 빌드**

Run: `cd /Users/hansangho/Desktop/forme && pnpm build`
Expected: 빌드 성공

**Step 3: 최종 커밋 (필요 시 수정사항 반영)**
