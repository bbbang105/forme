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

interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
}

interface Todo {
  id: string;
  date: string;
  isCompleted: boolean;
}

interface CalendarGridProps {
  currentMonth: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: CalendarEvent[];
  todos: Todo[];
}

interface DayCellProps {
  day: Date;
  dateKey: string;
  isCurrentDay: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  dayEvents: CalendarEvent[];
  dayTodos: Todo[];
  onSelect: (date: Date) => void;
}

// Memoized day cell — only re-renders when its own props change.
// The Maps produced by useMemo in CalendarGrid are structurally stable
// across parent renders that don't change events/todos, so each DayCell
// referentially receives the same arrays and skips reconciliation.
const DayCell = React.memo(function DayCell({
  day,
  dateKey,
  isCurrentDay,
  isSelected,
  isCurrentMonth,
  dayEvents,
  dayTodos,
  onSelect,
}: DayCellProps) {
  const dayOfWeek = day.getDay();
  const incompleteTodos = dayTodos.filter((t) => !t.isCompleted).length;
  const hasItems = dayEvents.length > 0 || dayTodos.length > 0;

  // Show up to 3 colour dots, then an overflow indicator
  const maxDots = 3;
  const uniqueColors = [...new Set(dayEvents.map((e) => e.color))];
  const visibleColors = uniqueColors.slice(0, maxDots);
  const overflowCount = dayEvents.length + incompleteTodos - maxDots;

  return (
    <button
      key={dateKey}
      onClick={() => onSelect(day)}
      className={cn(
        'relative flex flex-col items-center py-1.5 min-h-[44px] transition-colors rounded-lg',
        !isCurrentMonth && 'opacity-30',
        isSelected && 'bg-primary/10',
        !isSelected && 'hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full text-sm',
          isCurrentDay && 'bg-primary text-primary-foreground font-bold',
          isSelected && !isCurrentDay && 'bg-foreground text-background font-semibold',
          !isSelected && !isCurrentDay && dayOfWeek === 0 && 'text-red-400',
          !isSelected && !isCurrentDay && dayOfWeek === 6 && 'text-blue-400',
        )}
      >
        {format(day, 'd')}
      </span>

      {/* Dot indicators — event colours + amber todo dot */}
      {hasItems && (
        <div className="flex items-center gap-0.5 mt-0.5">
          {visibleColors.map((color) => (
            <span
              key={color}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          ))}
          {incompleteTodos > 0 && uniqueColors.length < maxDots && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
          {overflowCount > 0 && (
            <span className="text-[8px] leading-none text-muted-foreground font-medium">
              +{overflowCount}
            </span>
          )}
        </div>
      )}
    </button>
  );
});

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarGrid({
  currentMonth,
  selectedDate,
  onSelectDate,
  events,
  todos,
}: CalendarGridProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Group events by date — stable Map reference when events array hasn't changed
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      const days = eachDayOfInterval({ start, end });
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(event);
      }
    }
    return map;
  }, [events]);

  // Group todos by date — stable Map reference when todos array hasn't changed
  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!map.has(todo.date)) map.set(todo.date, []);
      map.get(todo.date)!.push(todo);
    }
    return map;
  }, [todos]);

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              'text-center text-xs font-medium py-2',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          return (
            <DayCell
              key={dateKey}
              day={day}
              dateKey={dateKey}
              isCurrentDay={isToday(day)}
              isSelected={isSameDay(day, selectedDate)}
              isCurrentMonth={isSameMonth(day, currentMonth)}
              dayEvents={eventsByDate.get(dateKey) ?? []}
              dayTodos={todosByDate.get(dateKey) ?? []}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>
    </div>
  );
}
