'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useTransition} from 'react';
import {addMonths, endOfMonth, format, startOfMonth, subMonths} from 'date-fns';
import {ko} from 'date-fns/locale';
import {CalendarDays, Circle, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import {CalendarGrid} from './calendar-grid';
import {TodoList} from './todo-list';
import {EventList} from './event-list';
import type {CalendarEvent, EventCategory, Todo} from './types';
import {
    deleteCalendarEvent,
    deleteRecurringAfter,
    excludeRecurringDate,
    getCalendarEvents,
    toggleCalendarEvent
} from '@/lib/actions/calendar';
import {getCategories} from '@/lib/actions/categories';
import {getTodosByDateRange, toggleTodo, updateTodo} from '@/lib/actions/todos';
import {useSwipe} from '@/hooks/use-swipe';
import {CalendarHeader} from './calendar-header';

const EventForm = dynamic(() => import('./event-form').then(m => m.EventForm), {ssr: false});
const CategoryManager = dynamic(() => import('./category-manager').then(m => m.CategoryManager), {ssr: false});

const EMPTY_DAY_MESSAGES = ['오늘은 여유로운 하루!', '한가한 하루네요', '일정이 없는 날이에요', '자유로운 하루를 보내세요', '쉬어가는 하루'];

export function CalendarClient() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, startFetching] = useTransition();

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const fetchData = useCallback(() => {
    const month = format(currentMonth, 'yyyy-MM');
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    // Pad date range for events that span month boundaries
    const paddedStart = new Date(start);
    paddedStart.setDate(paddedStart.getDate() - 7);
    const paddedEnd = new Date(end);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    return Promise.all([
      getCalendarEvents(month),
      getTodosByDateRange(
        format(paddedStart, 'yyyy-MM-dd'),
        format(paddedEnd, 'yyyy-MM-dd')
      ),
      getCategories(),
    ]).then(([eventsData, todosData, categoriesData]) => {
      setEvents(eventsData as CalendarEvent[]);
      setTodos(todosData as Todo[]);
      setCategories(categoriesData as EventCategory[]);
      setIsLoading(false);
    });
  }, [currentMonth]);

  useEffect(() => {
    startFetching(() => {
      fetchData();
    });
  }, [fetchData]);

  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handlePrevMonth = useCallback(() => {
    setSlideDirection('right');
    setCurrentMonth((m) => subMonths(m, 1));
    clearTimeout(slideTimerRef.current);
    slideTimerRef.current = setTimeout(() => setSlideDirection(null), 200);
  }, []);

  const handleNextMonth = useCallback(() => {
    setSlideDirection('left');
    setCurrentMonth((m) => addMonths(m, 1));
    clearTimeout(slideTimerRef.current);
    slideTimerRef.current = setTimeout(() => setSlideDirection(null), 200);
  }, []);

  useEffect(() => () => clearTimeout(slideTimerRef.current), []);

  const handleToday = useCallback(() => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    if (format(date, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
      setCurrentMonth(date);
    }
  }, [currentMonth]);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setShowEventForm(true);
  }, []);

  const handleAddEvent = useCallback(() => {
    setEditingEvent(null);
    setShowEventForm(true);
  }, []);

  // ─── Optimistic todo callbacks ────────────────────────────────────────────

  const handleTodoToggle = useCallback((todoId: string, isCompleted: boolean) => {
    // Update local state immediately for instant feedback
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, isCompleted } : t))
    );
  }, []);

  const handleTodoCreate = useCallback((todo: Todo) => {
    setTodos((prev) => [...prev, todo]);
  }, []);

  // Replace temp id produced by optimistic insert with the real DB row
  const handleTodoCreated = useCallback((tempId: string, created: Todo) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === tempId ? created : t))
    );
  }, []);

  const handleTodoDelete = useCallback((todoId: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
  }, []);

  const handleTodoUpdate = useCallback((todoId: string, content: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, content } : t))
    );
  }, []);

  const handleTodoReorder = useCallback((reordered: Todo[]) => {
    setTodos((prev) => {
      const reorderedIds = new Set(reordered.map((t) => t.id));
      const others = prev.filter((t) => !reorderedIds.has(t.id));
      return [...others, ...reordered];
    });
  }, []);


  const handleTodoDateChange = useCallback((todoId: string, newDate: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, date: newDate } : t))
    );
  }, []);

  const handleMoveToToday = useCallback((todoId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    handleTodoDateChange(todoId, today);
    startFetching(async () => {
      try {
        await updateTodo(todoId, { date: today });
      } catch {
        // rollback handled by next fetch
        fetchData();
      }
    });
  }, [handleTodoDateChange, fetchData]);

  const handleOverdueToggle = useCallback((todoId: string) => {
    // Optimistically mark as completed
    handleTodoToggle(todoId, true);
    startFetching(async () => {
      try {
        await toggleTodo(todoId);
      } catch {
        // rollback
        handleTodoToggle(todoId, false);
      }
    });
  }, [handleTodoToggle]);

  // ─── Optimistic event callbacks ───────────────────────────────────────────

  const handleEventCreate = useCallback((event: CalendarEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const handleEventUpdate = useCallback((updated: CalendarEvent) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
  }, []);

  const handleEventDelete = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const handleEventDeleteDirect = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    deleteCalendarEvent(eventId).catch(() => {
      // Refetch on failure to restore
      fetchData();
    });
  }, [fetchData]);

  const handleEventToggle = useCallback((eventId: string, isCompleted: boolean) => {
    const match = (e: CalendarEvent) => e.id === eventId || e._originalId === eventId;
    setEvents((prev) =>
      prev.map((e) => (match(e) ? { ...e, isCompleted } : e))
    );
    toggleCalendarEvent(eventId).catch(() => {
      setEvents((prev) =>
        prev.map((e) => (match(e) ? { ...e, isCompleted: !isCompleted } : e))
      );
    });
  }, []);

  const handleExcludeDate = useCallback(async (eventId: string, dateStr: string) => {
    // Optimistic: remove only that instance
    setEvents((prev) => prev.filter((e) => !(e._originalId === eventId && e._instanceDate === dateStr)));
    try {
      await excludeRecurringDate(eventId, dateStr);
    } catch {
      fetchData();
    }
  }, [fetchData]);

  const handleDeleteAfter = useCallback(async (eventId: string, dateStr: string) => {
    // Optimistic: remove all instances on or after that date
    setEvents((prev) => prev.filter((e) => !(e._originalId === eventId && e._instanceDate && e._instanceDate >= dateStr)));
    try {
      await deleteRecurringAfter(eventId, dateStr);
    } catch {
      fetchData();
    }
  }, [fetchData]);

  // ─── Touch swipe for month navigation ────────────────────────────────────

  const swipeHandlers = useSwipe({
    onSwipeLeft: handleNextMonth,
    onSwipeRight: handlePrevMonth,
    threshold: 60,
  });

  // ─── Keyboard navigation (Google Calendar style) ──────────────────────────

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
  }, [currentMonth, handleToday]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const overdueTodos = useMemo(
    () => todos.filter((t) => !t.isCompleted && t.date < todayStr),
    [todos, todayStr],
  );

  const dayEvents = useMemo(
    () => events.filter((e) => e.startDate <= selectedDateStr && e.endDate >= selectedDateStr),
    [events, selectedDateStr]
  );

  const selectedDateTodos = useMemo(
    () => todos.filter((t) => t.date === selectedDateStr),
    [todos, selectedDateStr]
  );
  const completedCount = useMemo(
    () => selectedDateTodos.filter((t) => t.isCompleted).length,
    [selectedDateTodos]
  );
  const totalCount = selectedDateTodos.length;

  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row lg:gap-6">
        {/* Left: Skeleton calendar */}
        <div className="lg:flex-1 lg:min-w-0 space-y-4">
          <div className="flex items-center justify-between px-4 sm:px-0">
            <Skeleton className="h-7 w-32" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
          <Card className="p-1 sm:p-3 rounded-none sm:rounded-xl border-x-0 sm:border-x">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0 mb-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex justify-center py-1">
                  <Skeleton className="h-4 w-6" />
                </div>
              ))}
            </div>
            {/* Calendar cells (6 rows x 7 cols) */}
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="grid grid-cols-7 gap-0">
                {Array.from({ length: 7 }).map((_, col) => (
                  <div key={col} className="aspect-square p-1">
                    <Skeleton className="h-4 w-4 mx-auto mb-1" />
                    {row < 3 && col % 3 === 0 && <Skeleton className="h-1.5 w-full rounded-full" />}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </div>
        {/* Right: Skeleton detail */}
        <div className="lg:w-[380px] lg:shrink-0 space-y-3 px-4 sm:px-0 mt-4 lg:mt-0">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <Card className="p-3 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </Card>
          <Card className="p-3 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row lg:gap-6">
      {/* Left: Month navigation + Calendar grid */}
      <div className="lg:flex-1 lg:min-w-0 space-y-4">
        {/* Month navigation */}
        <CalendarHeader
          currentMonth={currentMonth}
          isFetching={isFetching}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
        />

        {/* Calendar grid with swipe support */}
        <Card className="p-1 sm:p-3 rounded-none sm:rounded-xl border-x-0 sm:border-x overflow-hidden" {...swipeHandlers}>
          <div
            className={[
              slideDirection === 'left'
                ? 'animate-slide-left'
                : slideDirection === 'right'
                  ? 'animate-slide-right'
                  : '',
              isFetching ? 'opacity-60 transition-opacity' : '',
            ].filter(Boolean).join(' ')}
          >
            <CalendarGrid
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              events={events}
              todos={todos}
              categories={categories}
            />
          </div>
        </Card>
      </div>

      {/* Right: Selected date detail */}
      <div className="lg:w-[380px] lg:shrink-0 space-y-3 px-4 sm:px-0 mt-4 lg:mt-0">
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
          categories={categories}
          onEdit={handleEditEvent}
          onDelete={handleEventDeleteDirect}
          onToggle={handleEventToggle}
          onExcludeDate={handleExcludeDate}
          onDeleteAfter={handleDeleteAfter}
        />

        {/* Empty state */}
        {dayEvents.length === 0 && totalCount === 0 && (
          <Card className="p-6 text-center animate-fade-in">
            <p className="text-2xl mb-1">(&#x25D5;&#x203F;&#x25D5;)</p>
            <p className="text-sm text-muted-foreground">
              {EMPTY_DAY_MESSAGES[selectedDate.getDate() % EMPTY_DAY_MESSAGES.length]}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleAddEvent}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              일정 추가
            </Button>
          </Card>
        )}

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

          {overdueTodos.length > 0 && (
            <OverdueTodoChip
              todos={overdueTodos}
              onMoveToToday={handleMoveToToday}
              onToggle={handleOverdueToggle}
            />
          )}

          <TodoList
            todos={selectedDateTodos}
            selectedDate={selectedDateStr}
            onToggle={handleTodoToggle}
            onCreate={handleTodoCreate}
            onCreated={handleTodoCreated}
            onDelete={handleTodoDelete}
            onUpdate={handleTodoUpdate}
            onReorder={handleTodoReorder}
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
        categories={categories}
        onEventCreate={handleEventCreate}
        onEventUpdate={handleEventUpdate}
        onEventDelete={handleEventDelete}
        onManageCategories={() => setShowCategoryManager(true)}
        onExcludeDate={handleExcludeDate}
        onDeleteAfter={handleDeleteAfter}
      />

      {/* Category manager dialog */}
      <CategoryManager
        open={showCategoryManager}
        onOpenChange={setShowCategoryManager}
        categories={categories}
        onCategoriesChange={setCategories}
      />
    </div>
  );
}

// ─── Overdue Todo Chip ──────────────────────────────────────────────────────

function OverdueTodoChip({
  todos,
  onMoveToToday,
  onToggle,
}: {
  todos: Todo[];
  onMoveToToday: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        밀린 할 일 {todos.length}개
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1 animate-fade-in">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20"
            >
              <button
                onClick={() => onToggle(todo.id)}
                className="shrink-0"
              >
                <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground/60" />
              </button>
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 font-medium">
                {todo.date.slice(5).replace('-', '/')}
              </span>
              <span className="flex-1 text-sm truncate">{todo.content}</span>
              <button
                onClick={() => onMoveToToday(todo.id)}
                className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded hover:bg-primary/10 transition-colors"
              >
                오늘로
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
