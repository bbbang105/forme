'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {addMonths, endOfMonth, format, startOfMonth, subMonths} from 'date-fns';
import {
    deleteCalendarEvent,
    excludeRecurringDate,
    deleteRecurringAfter as _deleteRecurringAfter,
    getCalendarEvents,
    toggleCalendarEvent,
} from '@/lib/actions/calendar';
import {getCategories} from '@/lib/actions/categories';
import {getTodosByDateRange, toggleTodo, updateTodo} from '@/lib/actions/todos';
import type {CalendarEvent, EventCategory, Todo} from './types';

export interface CalendarState {
  currentMonth: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  todos: Todo[];
  categories: EventCategory[];
  showEventForm: boolean;
  editingEvent: CalendarEvent | null;
  showCategoryManager: boolean;
  slideDirection: 'left' | 'right' | null;
  isLoading: boolean;
  isFetching: boolean;
  // setters
  setCurrentMonth: (m: Date) => void;
  setSelectedDate: (d: Date) => void;
  setCategories: (c: EventCategory[]) => void;
  setShowEventForm: (v: boolean) => void;
  setEditingEvent: (e: CalendarEvent | null) => void;
  setShowCategoryManager: (v: boolean) => void;
  // handlers
  fetchData: () => Promise<void>;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  handleToday: () => void;
  handleSelectDate: (date: Date) => void;
  handleEditEvent: (event: CalendarEvent) => void;
  handleAddEvent: () => void;
  // todo handlers
  handleTodoToggle: (todoId: string, isCompleted: boolean) => void;
  handleTodoCreate: (todo: Todo) => void;
  handleTodoCreated: (tempId: string, created: Todo) => void;
  handleTodoDelete: (todoId: string) => void;
  handleTodoUpdate: (todoId: string, content: string) => void;
  handleTodoReorder: (reordered: Todo[]) => void;
  handleTodoDateChange: (todoId: string, newDate: string) => void;
  handleMoveToToday: (todoId: string) => void;
  handleOverdueToggle: (todoId: string) => void;
  // event handlers
  handleEventCreate: (event: CalendarEvent) => void;
  handleEventUpdate: (updated: CalendarEvent) => void;
  handleEventDelete: (eventId: string) => void;
  handleEventDeleteDirect: (eventId: string) => void;
  handleEventToggle: (eventId: string, isCompleted: boolean) => void;
  handleExcludeDate: (eventId: string, dateStr: string) => Promise<void>;
  handleDeleteAfter: (eventId: string, dateStr: string) => Promise<void>;
}

export function useCalendarState(): CalendarState {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  const fetchData = useCallback(async () => {
    const month = format(currentMonth, 'yyyy-MM');
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const paddedStart = new Date(start);
    paddedStart.setDate(paddedStart.getDate() - 7);
    const paddedEnd = new Date(end);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    setIsFetching(true);
    try {
      const [eventsData, todosData, categoriesData] = await Promise.all([
        getCalendarEvents(month),
        getTodosByDateRange(
          format(paddedStart, 'yyyy-MM-dd'),
          format(paddedEnd, 'yyyy-MM-dd')
        ),
        getCategories(),
      ]);
      setEvents(eventsData as CalendarEvent[]);
      setTodos(todosData as Todo[]);
      setCategories(categoriesData as EventCategory[]);
      setIsLoading(false);
    } finally {
      setIsFetching(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchData();
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

  // ─── Optimistic todo callbacks ─────────────────────────────────────────────

  const handleTodoToggle = useCallback((todoId: string, isCompleted: boolean) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, isCompleted } : t))
    );
  }, []);

  const handleTodoCreate = useCallback((todo: Todo) => {
    setTodos((prev) => [...prev, todo]);
  }, []);

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
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, date: today } : t))
    );
    updateTodo(todoId, { date: today }).catch(() => {
      fetchData();
    });
  }, [fetchData]);

  const handleOverdueToggle = useCallback((todoId: string) => {
    handleTodoToggle(todoId, true);
    toggleTodo(todoId).catch(() => {
      handleTodoToggle(todoId, false);
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
    setEvents((prev) => prev.filter((e) => !(e._originalId === eventId && e._instanceDate === dateStr)));
    try {
      await excludeRecurringDate(eventId, dateStr);
    } catch {
      fetchData();
    }
  }, [fetchData]);

  const handleDeleteAfter = useCallback(async (eventId: string, dateStr: string) => {
    setEvents((prev) => prev.filter((e) => !(e._originalId === eventId && e._instanceDate && e._instanceDate >= dateStr)));
    try {
      await _deleteRecurringAfter(eventId, dateStr);
    } catch {
      fetchData();
    }
  }, [fetchData]);

  return {
    currentMonth,
    selectedDate,
    events,
    todos,
    categories,
    showEventForm,
    editingEvent,
    showCategoryManager,
    slideDirection,
    isLoading,
    isFetching,
    setCurrentMonth,
    setSelectedDate,
    setCategories,
    setShowEventForm,
    setEditingEvent,
    setShowCategoryManager,
    fetchData,
    handlePrevMonth,
    handleNextMonth,
    handleToday,
    handleSelectDate,
    handleEditEvent,
    handleAddEvent,
    handleTodoToggle,
    handleTodoCreate,
    handleTodoCreated,
    handleTodoDelete,
    handleTodoUpdate,
    handleTodoReorder,
    handleTodoDateChange,
    handleMoveToToday,
    handleOverdueToggle,
    handleEventCreate,
    handleEventUpdate,
    handleEventDelete,
    handleEventDeleteDirect,
    handleEventToggle,
    handleExcludeDate,
    handleDeleteAfter,
  };
}
