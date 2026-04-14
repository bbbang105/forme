'use client';

import {useEffect, useMemo, useState} from 'react';
import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {CalendarDays, Circle, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
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

        {/* Calendar grid */}
        <Card className="p-1 sm:p-3 rounded-none sm:rounded-xl border-x-0 sm:border-x overflow-hidden">
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
              <div
                className="h-1.5 bg-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-label={`할 일 진행률: ${completedCount}/${totalCount}`}
              >
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
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`밀린 할 일 ${todos.length}개 - 클릭하여 ${isOpen ? '닫기' : '열기'}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
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
                aria-label={`${todo.content} 완료 처리`}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground/60" />
              </button>
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 font-medium">
                {todo.date.slice(5).replace('-', '/')}
              </span>
              <span className="flex-1 text-sm truncate">{todo.content}</span>
              <button
                onClick={() => onMoveToToday(todo.id)}
                aria-label={`${todo.content} 오늘로 이동`}
                className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] flex items-center"
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
