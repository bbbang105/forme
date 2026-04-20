'use client';

import {useMemo} from 'react';
import {
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import {cn} from '@/lib/utils';
import type {CalendarEvent, EventCategory, Todo} from './types';
import {DayCell, dateToKey} from './day-cell';
import {computeEventLanes} from './lane-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

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
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  // Lane-based event computation (all events, no spanning bar distinction)
  const { eventsByDate, eventLaneMap } = useMemo(
    () => computeEventLanes(events),
    [events],
  );

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!map.has(todo.date)) map.set(todo.date, []);
      map.get(todo.date)!.push(todo);
    }
    return map;
  }, [todos]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, EventCategory>();
    for (const cat of categories) m.set(cat.id, cat);
    return m;
  }, [categories]);

  return (
    <div className="select-none w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border/40">
        {WEEKDAYS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'text-center font-mono text-[10px] uppercase tracking-[0.1em] py-2',
              i === 0 ? 'text-red-400/80' : i === 6 ? 'text-blue-400/80' : 'text-muted-foreground',
              i < 6 && 'border-r border-border/30',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex flex-col divide-y divide-border/40">
        {weeks.map((weekDays) => (
          <div key={dateToKey(weekDays[0])} className="grid grid-cols-7">
            {weekDays.map((day, colIdx) => {
              const dateKey = dateToKey(day);
              return (
                <DayCell
                  key={dateKey}
                  day={day}
                  colIdx={colIdx}
                  selectedDate={selectedDate}
                  currentMonth={currentMonth}
                  dayEvents={eventsByDate.get(dateKey) ?? []}
                  eventLaneMap={eventLaneMap}
                  categoryMap={categoryMap}
                  dayTodos={todosByDate.get(dateKey) ?? []}
                  onSelectDate={onSelectDate}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
