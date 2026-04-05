'use client';

import React, {useMemo} from 'react';
import {format, isSameDay, isSameMonth, isToday} from 'date-fns';
import {cn} from '@/lib/utils';
import type {CalendarEvent, EventCategory, Todo} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE_EVENTS = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function dateToKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DayCellProps {
  day: Date;
  colIdx: number;
  selectedDate: Date;
  currentMonth: Date;
  dayEvents: CalendarEvent[];
  eventLaneMap: Map<string, number>;
  categoryMap: Map<string, EventCategory>;
  dayTodos: Todo[];
  onSelectDate: (date: Date) => void;
}

// ---------------------------------------------------------------------------
// DayCell
// ---------------------------------------------------------------------------

export const DayCell = React.memo(function DayCell({
  day,
  colIdx,
  selectedDate,
  currentMonth,
  dayEvents,
  eventLaneMap,
  categoryMap,
  dayTodos,
  onSelectDate,
}: DayCellProps) {
  const dayOfWeek = day.getDay();
  const isCurrent = isToday(day);
  const isSelectedDay = isSameDay(day, selectedDate);
  const inMonth = isSameMonth(day, currentMonth);
  const dateKey = dateToKey(day);
  const incompleteTodos = useMemo(
    () => dayTodos.filter((t) => !t.isCompleted).length,
    [dayTodos],
  );

  const colorDots = useMemo(() => {
    const colors = [...new Set(dayEvents.map((e) => e.color))];
    return colors.slice(0, 3);
  }, [dayEvents]);

  // Build lane array with nulls for empty lanes
  const lanes = useMemo(() => {
    if (dayEvents.length === 0) return [];
    const maxLane = Math.max(...dayEvents.map((e) => eventLaneMap.get(e.id) ?? 0));
    const arr: (CalendarEvent | null)[] = Array(maxLane + 1).fill(null);
    for (const event of dayEvents) {
      const lane = eventLaneMap.get(event.id) ?? 0;
      arr[lane] = event;
    }
    return arr;
  }, [dayEvents, eventLaneMap]);

  const visibleLanes = lanes.slice(0, MAX_VISIBLE_EVENTS);
  const overflowCount = lanes.length - MAX_VISIBLE_EVENTS;

  return (
    <button
      key={dateKey}
      type="button"
      onClick={() => onSelectDate(day)}
      aria-label={`${format(day, 'yyyy년 M월 d일')}${isSelectedDay ? ' (선택됨)' : ''}${isCurrent ? ' (오늘)' : ''}`}
      aria-pressed={isSelectedDay}
      className={cn(
        'relative flex flex-col w-full text-left overflow-hidden',
        'min-h-[80px] sm:min-h-[92px]',
        'hover:bg-muted/30 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        !inMonth && 'opacity-40',
        colIdx < 6 && 'border-r border-border/30',
      )}
    >
      {/* Date number */}
      <div className="flex flex-col items-center pt-0.5 pb-px">
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
        {colorDots.length > 0 && (
          <div className="flex gap-0.5 mt-px" aria-hidden="true">
            {colorDots.map((c) => (
              <span
                key={c}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Event bars (lane-based) */}
      {visibleLanes.length > 0 && (
        <div className="flex flex-col gap-px" aria-hidden="true">
          {visibleLanes.map((event, lane) => {
            if (!event) {
              // Empty lane spacer — invisible but reserves height
              return (
                <div
                  key={`spacer-${lane}`}
                  className="text-[9px] sm:text-[11px] leading-tight py-px invisible"
                  aria-hidden="true"
                >
                  {'\u00A0'}
                </div>
              );
            }

            const isStart = event.startDate === dateKey;
            const isEnd = event.endDate === dateKey;
            const isSingle = isStart && isEnd;
            const isMultiDay = !isSingle;
            const category = event.categoryId ? categoryMap.get(event.categoryId) : undefined;

            if (isMultiDay) {
              const startNextDate = parseLocalDate(event.startDate);
              startNextDate.setDate(startNextDate.getDate() + 1);
              const isSecondDay = dateKey === dateToKey(startNextDate);

              return (
                <div
                  key={event.id}
                  className={cn(
                    'text-[9px] sm:text-[11px] leading-tight px-1 py-px font-medium truncate -mx-px',
                    isStart && 'overflow-visible whitespace-nowrap relative z-10',
                    event.isCompleted && 'line-through opacity-50',
                  )}
                  style={{
                    backgroundColor: `${event.color}20`,
                    color: event.color,
                    borderRadius: isStart
                      ? '3px 0 0 3px'
                      : isEnd
                        ? '0 3px 3px 0'
                        : '0',
                  }}
                  title={event.title}
                >
                  {isStart ? (
                    <span className="flex items-center gap-0.5">
                      {category && <span className="shrink-0">{category.icon}</span>}
                      <span className="truncate">{event.title}</span>
                    </span>
                  ) : isSecondDay && event.startTime ? (
                    <span className="opacity-70" style={{ fontSize: '8px' }}>
                      {event.startTime.slice(0, 5)}
                    </span>
                  ) : (
                    '\u00A0'
                  )}
                </div>
              );
            }

            // Single-day event
            if (!event.startTime) {
              return (
                <div
                  key={event.id}
                  className={cn(
                    'text-[9px] sm:text-[11px] leading-tight px-1 py-px font-medium truncate rounded-sm',
                    event.isCompleted && 'line-through opacity-50',
                  )}
                  style={{
                    backgroundColor: `${event.color}20`,
                    color: event.color,
                  }}
                  title={event.title}
                >
                  {category && <span className="mr-0.5">{category.icon}</span>}
                  {event.title}
                </div>
              );
            }

            // Timed single-day
            return (
              <div
                key={event.id}
                className={cn(
                  'flex items-center gap-px text-[9px] sm:text-[11px] leading-tight py-px px-0.5 truncate',
                  event.isCompleted && 'line-through opacity-50',
                )}
                title={`${event.startTime} ${event.title}`}
              >
                <span
                  className="shrink-0 rounded-full"
                  style={{ width: '2px', height: '9px', backgroundColor: event.color }}
                />
                <span className="text-foreground truncate">{event.title}</span>
                <span className="shrink-0 ml-auto text-muted-foreground opacity-70" style={{ fontSize: '8px' }}>
                  {event.startTime.slice(0, 5)}
                </span>
              </div>
            );
          })}
          {overflowCount > 0 && (
            <span className="text-[8px] sm:text-[10px] text-muted-foreground pl-1 leading-tight">
              +{overflowCount}개
            </span>
          )}
        </div>
      )}

      {/* Todo indicator */}
      {incompleteTodos > 0 && (
        <span
          aria-hidden="true"
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
