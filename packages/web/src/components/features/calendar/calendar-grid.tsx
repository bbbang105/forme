'use client';

import React, {useMemo} from 'react';
import {
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import {cn} from '@/lib/utils';
import type {CalendarEvent, EventCategory, Todo} from './types';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SpanSlot {
  event: CalendarEvent;
  /** 0-based column within the week (0 = Sunday) */
  startCol: number;
  /** 0-based column within the week (0 = Sunday) */
  endCol: number;
  /** Event actually starts in this week (not carried over from previous week) */
  isStart: boolean;
  /** Event actually ends in this week (not carried over to next week) */
  isEnd: boolean;
}

interface WeekSpanRow {
  slots: SpanSlot[][];   // slots[row] = array of non-overlapping events in that row
  overflow: number;
}

interface CalendarGridProps {
  currentMonth: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: CalendarEvent[];
  todos: Todo[];
  categories: EventCategory[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const MAX_SPAN_ROWS = 2;
const MAX_SINGLE_EVENTS = 2;
/** Height in px reserved per spanning bar row above the day cells */
const SPAN_ROW_HEIGHT = 22; // px — bar 18px + 2px gap top + 2px gap bottom

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateToKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse a YYYY-MM-DD string as a local midnight Date (avoids UTC shift).
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Number of calendar days an event spans (1 = same day, 2 = two days, …) */
function eventDaySpan(startDate: string, endDate: string): number {
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

/** Threshold: events spanning 2+ days use spanning bars; single-day events go in cells */
const MIN_SPAN_DAYS = 2;

/**
 * For a given week (array of 7 days), compute SpanSlot assignments for
 * multi-day events. Uses a greedy row-allocation algorithm capped at MAX_SPAN_ROWS.
 */
function computeWeekSpans(
  weekDays: Date[],
  multiDayEvents: CalendarEvent[],
): WeekSpanRow {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const candidates: SpanSlot[] = [];

  for (const event of multiDayEvents) {
    const evStart = parseLocalDate(event.startDate);
    const evEnd = parseLocalDate(event.endDate);

    // Does this event overlap with the current week at all?
    if (evEnd < weekStart || evStart > weekEnd) continue;

    const isStart = evStart >= weekStart;
    const isEnd = evEnd <= weekEnd;

    const startCol = isStart ? evStart.getDay() : 0;
    const endCol = isEnd ? evEnd.getDay() : 6;

    candidates.push({ event, startCol, endCol, isStart, isEnd });
  }

  // Sort: events that start earlier in the week first; longer events first
  candidates.sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return (b.endCol - b.startCol) - (a.endCol - a.startCol);
  });

  // Greedy row allocation — multiple events per row if they don't overlap
  const rows: SpanSlot[][] = [[], []];
  const occupiedUntil: number[] = [-1, -1];
  let overflow = 0;

  for (const slot of candidates) {
    let placed = false;
    for (let row = 0; row < MAX_SPAN_ROWS; row++) {
      if (occupiedUntil[row] < slot.startCol) {
        rows[row].push(slot);
        occupiedUntil[row] = slot.endCol;
        placed = true;
        break;
      }
    }
    if (!placed) overflow++;
  }

  return { slots: rows, overflow };
}

// ---------------------------------------------------------------------------
// SpanBar — a single multi-day event bar rendered inside a week row
// ---------------------------------------------------------------------------

interface SpanBarProps {
  slot: SpanSlot;
  categoryIcon?: string;
}

const SpanBar = React.memo(function SpanBar({ slot, categoryIcon }: SpanBarProps) {
  const { event, startCol, endCol, isStart, isEnd } = slot;

  // Grid column: CSS grid is 1-indexed
  const colStart = startCol + 1;
  const colSpan = endCol - startCol + 1;

  const bgColor = `${event.color}20`;
  const textColor = event.color;

  return (
    <div
      style={{
        gridColumnStart: colStart,
        gridColumnEnd: `span ${colSpan}`,
        backgroundColor: bgColor,
        color: textColor,
      }}
      className={cn(
        'flex items-center gap-0.5 px-0.5 sm:px-1.5 overflow-hidden whitespace-nowrap select-none',
        'h-[16px] sm:h-[18px] text-[9px] sm:text-[11px] leading-[16px] sm:leading-[18px]',
        isStart ? 'rounded-l-full' : 'rounded-l-none',
        isEnd ? 'rounded-r-full' : 'rounded-r-none',
        // When it doesn't start here, remove left padding so it butts flush
        !isStart && 'pl-0.5',
      )}
      title={event.title}
    >
      {categoryIcon && isStart && (
        <span className="shrink-0 leading-none">{categoryIcon}</span>
      )}
      {isStart && (
        <span className="overflow-hidden font-medium" style={{ textOverflow: 'clip' }}>{event.title}</span>
      )}
      {isStart && event.startTime && (
        <span className="shrink-0 ml-auto opacity-70" style={{ fontSize: '8px' }}>{event.startTime.slice(0, 5)}</span>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// WeekRow — renders spanning bars + day cells for a single calendar week
// ---------------------------------------------------------------------------

interface WeekRowProps {
  weekDays: Date[];
  selectedDate: Date;
  currentMonth: Date;
  spanRow: WeekSpanRow;
  categories: EventCategory[];
  /** Map: dateKey -> single-day events */
  singleDayEventsByDate: Map<string, CalendarEvent[]>;
  /** Map: dateKey -> todos */
  todosByDate: Map<string, Todo[]>;
  onSelectDate: (date: Date) => void;
}

const WeekRow = React.memo(function WeekRow({
  weekDays,
  selectedDate,
  currentMonth,
  spanRow,
  categories,
  singleDayEventsByDate,
  todosByDate,
  onSelectDate,
}: WeekRowProps) {
  const categoryMap = useMemo(() => {
    const m = new Map<string, EventCategory>();
    for (const cat of categories) m.set(cat.id, cat);
    return m;
  }, [categories]);

  const hasSpans = spanRow.slots[0].length > 0 || spanRow.slots[1].length > 0;

  return (
    <div>
      {/* ── Day columns: date number + cell content (unified click/hover) ── */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => {
          const dayOfWeek = day.getDay();
          const isCurrent = isToday(day);
          const isSelectedDay = isSameDay(day, selectedDate);
          const inMonth = isSameMonth(day, currentMonth);
          const dateKey = dateToKey(day);
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                'flex flex-col items-center w-full text-left',
                'hover:bg-muted/30 transition-colors',
                !inMonth && 'opacity-40',
              )}
            >
              {/* Date number */}
              <div className="pt-1 pb-0.5">
                <span
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
                    isCurrent && 'bg-primary text-primary-foreground font-bold',
                    isSelectedDay && !isCurrent && 'bg-foreground text-background font-semibold',
                    !isSelectedDay && !isCurrent && dayOfWeek === 0 && 'text-red-400',
                    !isSelectedDay && !isCurrent && dayOfWeek === 6 && 'text-blue-400',
                    !isSelectedDay && !isCurrent && dayOfWeek !== 0 && dayOfWeek !== 6 && 'text-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Spanning bars (below date numbers, pointer-events-none) ── */}
      {hasSpans &&
        spanRow.slots.map((rowSlots, rowIdx) =>
          rowSlots.length > 0 ? (
            <div
              key={rowIdx}
              className="grid grid-cols-7 pointer-events-none"
              style={{ paddingTop: '1px' }}
            >
              {rowSlots.map((slot) => (
                <SpanBar
                  key={slot.event.id}
                  slot={slot}
                  categoryIcon={
                    slot.event.categoryId
                      ? categoryMap.get(slot.event.categoryId)?.icon
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null
        )
      }

      {/* ── Single-day events + todo dots (clickable per cell) ── */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => {
          const dateKey = dateToKey(day);
          const inMonth = isSameMonth(day, currentMonth);
          return (
            <DayCellContent
              key={dateKey}
              day={day}
              isCurrentMonth={inMonth}
              singleDayEvents={singleDayEventsByDate.get(dateKey) ?? []}
              dayTodos={todosByDate.get(dateKey) ?? []}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// DayCellContent — event list + todo indicator below date numbers & span bars
// ---------------------------------------------------------------------------

interface DayCellContentProps {
  day: Date;
  isCurrentMonth: boolean;
  singleDayEvents: CalendarEvent[];
  dayTodos: Todo[];
  onSelect: (date: Date) => void;
}

const DayCellContent = React.memo(function DayCellContent({
  day,
  isCurrentMonth,
  singleDayEvents,
  dayTodos,
  onSelect,
}: DayCellContentProps) {
  const incompleteTodos = useMemo(
    () => dayTodos.filter((t) => !t.isCompleted).length,
    [dayTodos],
  );

  const visibleEvents = singleDayEvents.slice(0, MAX_SINGLE_EVENTS);
  const eventOverflow = singleDayEvents.length - MAX_SINGLE_EVENTS;

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      className={cn(
        'relative flex flex-col w-full text-left px-0.5 sm:px-1 pb-1',
        'min-h-[28px] sm:min-h-[36px]',
        'hover:bg-muted/30 transition-colors',
        !isCurrentMonth && 'opacity-40',
      )}
    >
      {/* Single-day events */}
      <div className="flex flex-col gap-px w-full min-w-0 flex-1">
        {visibleEvents.map((event) => (
          <SingleDayEvent key={event.id} event={event} />
        ))}
        {eventOverflow > 0 && (
          <span className="text-[8px] sm:text-[10px] text-muted-foreground pl-0.5 leading-tight">
            +{eventOverflow}개
          </span>
        )}
      </div>

      {/* Todo indicator — bottom-right */}
      {incompleteTodos > 0 && (
        <span
          className={cn(
            'absolute bottom-0.5 right-1 flex items-center gap-0.5',
            'text-[10px] text-primary leading-none font-medium',
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          {incompleteTodos >= 2 && <span>{incompleteTodos}</span>}
        </span>
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// SingleDayEvent — mini event row inside a day cell
// ---------------------------------------------------------------------------

interface SingleDayEventProps {
  event: CalendarEvent;
}

const SingleDayEvent = React.memo(function SingleDayEvent({ event }: SingleDayEventProps) {
  const isAllDay = event.startTime === null;

  if (isAllDay) {
    return (
      <div
        className="w-full overflow-hidden rounded-sm px-0.5 sm:px-1 leading-[15px] text-[9px] sm:text-[11px]"
        style={{
          backgroundColor: `${event.color}20`,
          color: event.color,
          height: '15px',
          textOverflow: 'clip',
          whiteSpace: 'nowrap',
        }}
        title={event.title}
      >
        <span className="font-medium">{event.title}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center w-full overflow-hidden text-[9px] sm:text-[11px]"
      style={{ height: '15px', whiteSpace: 'nowrap', textOverflow: 'clip' }}
      title={`${event.startTime} ${event.title}`}
    >
      <span
        className="shrink-0 rounded-full mr-px"
        style={{
          width: '2px',
          height: '9px',
          backgroundColor: event.color,
        }}
      />
      <span className="text-foreground overflow-hidden" style={{ textOverflow: 'clip' }}>{event.title}</span>
      <span className="shrink-0 ml-auto text-muted-foreground opacity-70" style={{ fontSize: '8px' }}>
        {event.startTime!.slice(0, 5)}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// CalendarGrid — root export
// ---------------------------------------------------------------------------

export function CalendarGrid({
  currentMonth,
  selectedDate,
  onSelectDate,
  events,
  todos,
  categories,
}: CalendarGridProps) {
  // ── All calendar days (padded to complete weeks) ──
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // ── Split days into weeks ──
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  // ── Multi-day events (3+ days → spanning bars) ──
  const multiDayEvents = useMemo(
    () => events.filter((e) => eventDaySpan(e.startDate, e.endDate) >= MIN_SPAN_DAYS),
    [events],
  );

  // ── Cell events: same-day + short multi-day (1-2 days), grouped by each date they cover ──
  const singleDayEventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const span = eventDaySpan(event.startDate, event.endDate);
      if (span < MIN_SPAN_DAYS) {
        // Add to every date the event covers
        const start = parseLocalDate(event.startDate);
        for (let d = 0; d < span; d++) {
          const date = new Date(start);
          date.setDate(date.getDate() + d);
          const key = dateToKey(date);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(event);
        }
      }
    }
    return map;
  }, [events]);

  // ── Todos grouped by date ──
  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!map.has(todo.date)) map.set(todo.date, []);
      map.get(todo.date)!.push(todo);
    }
    return map;
  }, [todos]);

  // ── Spanning slot computation per week ──
  const weekSpans = useMemo(
    () => weeks.map((weekDays) => computeWeekSpans(weekDays, multiDayEvents)),
    [weeks, multiDayEvents],
  );

  return (
    <div className="select-none w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1 border-b border-border/40">
        {WEEKDAYS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'text-center text-xs font-medium py-2',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-muted-foreground',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex flex-col divide-y divide-border/40">
        {weeks.map((weekDays, weekIndex) => (
          <WeekRow
            key={dateToKey(weekDays[0])}
            weekDays={weekDays}
            selectedDate={selectedDate}
            currentMonth={currentMonth}
            spanRow={weekSpans[weekIndex]}
            categories={categories}
            singleDayEventsByDate={singleDayEventsByDate}
            todosByDate={todosByDate}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}
