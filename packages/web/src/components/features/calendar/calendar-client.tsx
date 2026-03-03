'use client';

import {useCallback, useEffect, useState, useTransition} from 'react';
import {addMonths, endOfMonth, format, startOfMonth, subMonths} from 'date-fns';
import {ko} from 'date-fns/locale';
import {CalendarDays, ChevronLeft, ChevronRight, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {CalendarGrid} from './calendar-grid';
import {TodoList} from './todo-list';
import {EventList} from './event-list';
import {EventForm} from './event-form';
import {getCalendarEvents} from '@/lib/actions/calendar';
import {getTodosByDateRange} from '@/lib/actions/todos';
import {useSwipe} from '@/hooks/use-swipe';

interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description: string | null;
}

interface Todo {
  id: string;
  date: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
}

export function CalendarClient() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [, startTransition] = useTransition();

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    const month = format(currentMonth, 'yyyy-MM');
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    // Pad date range for events that span month boundaries
    const paddedStart = new Date(start);
    paddedStart.setDate(paddedStart.getDate() - 7);
    const paddedEnd = new Date(end);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    const [eventsData, todosData] = await Promise.all([
      getCalendarEvents(month),
      getTodosByDateRange(
        format(paddedStart, 'yyyy-MM-dd'),
        format(paddedEnd, 'yyyy-MM-dd')
      ),
    ]);

    setEvents(eventsData as CalendarEvent[]);
    setTodos(todosData as Todo[]);
  }, [currentMonth]);

  useEffect(() => {
    startTransition(() => {
      fetchData();
    });
  }, [fetchData]);

  const handlePrevMonth = useCallback(() => {
    setSlideDirection('right');
    setCurrentMonth((m) => subMonths(m, 1));
    setTimeout(() => setSlideDirection(null), 200);
  }, []);

  const handleNextMonth = useCallback(() => {
    setSlideDirection('left');
    setCurrentMonth((m) => addMonths(m, 1));
    setTimeout(() => setSlideDirection(null), 200);
  }, []);

  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    if (format(date, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
      setCurrentMonth(date);
    }
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleAddEvent = () => {
    setEditingEvent(null);
    setShowEventForm(true);
  };

  const handleRefresh = () => {
    startTransition(() => {
      fetchData();
    });
  };

  // Touch swipe for month navigation
  const swipeHandlers = useSwipe({
    onSwipeLeft: handleNextMonth,
    onSwipeRight: handlePrevMonth,
    threshold: 60,
  });

  // Keyboard navigation (Google Calendar style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys when dialog/input is focused
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('[role="dialog"]')) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedDate((d) => {
            const prev = new Date(d);
            prev.setDate(prev.getDate() - 1);
            if (format(prev, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
              setCurrentMonth(prev);
            }
            return prev;
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          setSelectedDate((d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            if (format(next, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
              setCurrentMonth(next);
            }
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedDate((d) => {
            const prev = new Date(d);
            prev.setDate(prev.getDate() - 7);
            if (format(prev, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
              setCurrentMonth(prev);
            }
            return prev;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedDate((d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + 7);
            if (format(next, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
              setCurrentMonth(next);
            }
            return next;
          });
          break;
        case 't':
        case 'T':
          handleToday();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMonth]);

  // Filter todos for selected date
  const selectedDateTodos = todos.filter((t) => t.date === selectedDateStr);
  const completedCount = selectedDateTodos.filter((t) => t.isCompleted).length;
  const totalCount = selectedDateTodos.length;

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h2>
          <button
            onClick={handleToday}
            className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            오늘
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid with swipe support */}
      <Card className="p-3 overflow-hidden" {...swipeHandlers}>
        <div
          className={
            slideDirection === 'left'
              ? 'animate-slide-left'
              : slideDirection === 'right'
                ? 'animate-slide-right'
                : ''
          }
        >
          <CalendarGrid
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            events={events}
            todos={todos}
          />
        </div>
      </Card>

      {/* Selected date detail */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-primary" />
            {format(selectedDate, 'M월 d일 (EEEE)', { locale: ko })}
          </h3>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddEvent}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            일정
          </Button>
        </div>

        {/* Events for selected date */}
        <EventList
          events={events}
          selectedDate={selectedDate}
          onEdit={handleEditEvent}
        />

        {/* Todos for selected date */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-medium text-muted-foreground">
              할 일
              {totalCount > 0 && (
                <span className="ml-1.5 text-foreground/70">
                  {completedCount}/{totalCount}
                </span>
              )}
            </p>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mx-1 mb-3">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          )}

          <TodoList
            todos={selectedDateTodos}
            selectedDate={selectedDateStr}
            onRefresh={handleRefresh}
          />
        </Card>
      </div>

      {/* Event form dialog */}
      <EventForm
        open={showEventForm}
        onOpenChange={(open) => {
          setShowEventForm(open);
          if (!open) setEditingEvent(null);
        }}
        event={editingEvent}
        defaultDate={selectedDateStr}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
