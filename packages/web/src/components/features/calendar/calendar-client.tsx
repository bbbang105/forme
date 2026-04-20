'use client';

import {useEffect, useMemo, useState} from 'react';
import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {Circle, Plus} from 'lucide-react';
import {Skeleton} from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import {CalendarGrid} from './calendar-grid';
import {TodoList} from './todo-list';
import {EventList} from './event-list';
import {CalendarHeader} from './calendar-header';
import {useCalendarState} from './use-calendar-state';

const EventForm = dynamic(() => import('./event-form').then(m => m.EventForm), {
  ssr: false,
  loading: () => null,
});
const CategoryManager = dynamic(() => import('./category-manager').then(m => m.CategoryManager), {ssr: false});

// ─── Constants ────────────────────────────────────────────────────────────────
export const EMPTY_DAY_MESSAGES = [
  '오늘은 여유로운 하루!',
  '한가한 하루네요',
  '일정이 없는 날이에요',
  '자유로운 하루를 보내세요',
  '쉬어가는 하루',
];

export function CalendarClient() {
  const {
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
    setCategories,
    setShowEventForm,
    setEditingEvent,
    setShowCategoryManager,
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
    handleMoveToToday,
    handleOverdueToggle,
    handleEventCreate,
    handleEventUpdate,
    handleEventDelete,
    handleEventDeleteDirect,
    handleEventToggle,
    handleExcludeDate,
    handleDeleteAfter,
    handleInstanceUpdate,
  } = useCalendarState();

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  // ─── Keyboard navigation (Google Calendar style) ────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('[role="dialog"]')) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleSelectDate(new Date(selectedDate.getTime() - 86400000));
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSelectDate(new Date(selectedDate.getTime() + 86400000));
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleSelectDate(new Date(selectedDate.getTime() - 7 * 86400000));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleSelectDate(new Date(selectedDate.getTime() + 7 * 86400000));
          break;
        case 't':
        case 'T':
          handleToday();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, handleSelectDate, handleToday]);

  // ─── Derived state ─────────────────────────────────────────────────────────

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
      <div className="flex flex-col lg:flex-row lg:gap-10">
        <div className="lg:flex-1 lg:min-w-0 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-border px-4 sm:px-0">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-8 w-8 rounded-sm" />
              <Skeleton className="h-8 w-8 rounded-sm" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0 pb-2 border-b border-border/40">
            {Array.from({length: 7}).map((_, i) => (
              <div key={i} className="flex justify-center py-1"><Skeleton className="h-3 w-8" /></div>
            ))}
          </div>
          {Array.from({length: 6}).map((_, row) => (
            <div key={row} className="grid grid-cols-7 gap-0">
              {Array.from({length: 7}).map((_, col) => (
                <div key={col} className="aspect-square p-1">
                  <Skeleton className="h-4 w-4 mx-auto mb-1 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="lg:w-[380px] lg:shrink-0 space-y-6 px-4 sm:px-0 mt-4 lg:mt-0">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-sm" />
          <Skeleton className="h-24 w-full rounded-sm" />
        </div>
      </div>
    );
  }

  const selectedDateDisplay = format(selectedDate, 'M월 d일', {locale: ko});
  const selectedDateWeekday = format(selectedDate, 'EEEE', {locale: ko});
  const selectedDateMono = format(selectedDate, 'MM.dd').toUpperCase();

  return (
    <div className="flex flex-col lg:flex-row lg:gap-10">
      {/* Left: Month navigation + Calendar grid */}
      <div className="lg:flex-1 lg:min-w-0 space-y-5">
        <CalendarHeader
          currentMonth={currentMonth}
          isFetching={isFetching}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
        />

        <div
          className={[
            slideDirection === 'left' ? 'animate-slide-left' : slideDirection === 'right' ? 'animate-slide-right' : '',
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
      </div>

      {/* Right: Selected date detail */}
      <div className="lg:w-[380px] lg:shrink-0 space-y-8 px-4 sm:px-0 mt-8 lg:mt-0">
        {/* Date masthead */}
        <div className="flex items-baseline justify-between pb-3 border-b border-border">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
              <span className="text-primary" aria-hidden="true">—</span> {selectedDateMono}
            </span>
            <h3 className="font-display text-2xl leading-none text-foreground truncate">
              {selectedDateDisplay}{' '}
              <span className="text-muted-foreground">{selectedDateWeekday}</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={handleAddEvent}
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            New
          </button>
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
          <div className="py-10 text-center animate-fade-in space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="text-primary" aria-hidden="true">—</span> Open day
            </p>
            <p className="font-display text-xl leading-snug text-foreground">
              {EMPTY_DAY_MESSAGES[selectedDate.getDate() % EMPTY_DAY_MESSAGES.length]}
            </p>
            <button
              type="button"
              onClick={handleAddEvent}
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add event
            </button>
          </div>
        )}

        {/* Todos for selected date */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between pb-2 border-b border-border/60">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="text-primary" aria-hidden="true">—</span> Tasks{totalCount > 0 ? ` · ${completedCount}/${totalCount}` : ''}
            </span>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div>
              <div
                className="h-px bg-border overflow-hidden"
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-label={`할 일 진행률: ${completedCount}/${totalCount}`}
              >
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{width: `${(completedCount / totalCount) * 100}%`}}
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
        </section>
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
        onInstanceUpdate={handleInstanceUpdate}
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

// ─── Overdue Todo Chip ────────────────────────────────────────────────────────

function OverdueTodoChip({
  todos,
  onMoveToToday,
  onToggle,
}: {
  todos: import('./types').Todo[];
  onMoveToToday: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`밀린 할 일 ${todos.length}개 - 클릭하여 ${isOpen ? '닫기' : '열기'}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary hover:text-primary/80 transition-colors cursor-pointer"
      >
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" aria-hidden="true" />
        <span aria-hidden="true">—</span> Overdue · {todos.length}
      </button>

      {isOpen && (
        <ul className="mt-3 space-y-1.5 animate-fade-in">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-2 py-1.5 pl-3 border-l-2 border-primary/40"
            >
              <button
                onClick={() => onToggle(todo.id)}
                aria-label={`${todo.content} 완료 처리`}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground/60" aria-hidden="true" />
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-primary shrink-0">
                {todo.date.slice(5).replace('-', '/')}
              </span>
              <span className="flex-1 text-sm truncate">{todo.content}</span>
              <button
                onClick={() => onMoveToToday(todo.id)}
                aria-label={`${todo.content} 오늘로 이동`}
                className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-primary hover:text-primary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] flex items-center cursor-pointer"
              >
                Today →
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
