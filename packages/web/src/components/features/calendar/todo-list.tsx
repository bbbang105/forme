'use client';

import {forwardRef, useCallback, useState, useTransition} from 'react';
import {CheckCircle2, ChevronRight, Circle, GripVertical, Pencil, Plus, Trash2} from 'lucide-react';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {restrictToVerticalAxis} from '@dnd-kit/modifiers';
import {cn} from '@/lib/utils';
import {createTodo, deleteTodo, reorderTodos, toggleTodo, updateTodo} from '@/lib/actions/todos';
import {Input} from '@/components/ui/input';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {Todo} from './types';

interface TodoListProps {
  todos: Todo[];
  selectedDate: string;
  onToggle: (todoId: string, isCompleted: boolean) => void;
  onCreate: (todo: Todo) => void;
  onCreated: (tempId: string, created: Todo) => void;
  onDelete: (todoId: string) => void;
  onUpdate: (todoId: string, content: string) => void;
  onReorder: (reordered: Todo[]) => void;
}

export function TodoList({
  todos,
  selectedDate,
  onToggle,
  onCreate,
  onCreated,
  onDelete,
  onUpdate,
  onReorder,
}: TodoListProps) {
  const [newContent, setNewContent] = useState('');
  const [isPending, startTransition] = useTransition();
  const [showCompleted, setShowCompleted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleAdd = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const tempId = crypto.randomUUID();
    const tempTodo: Todo = {
      id: tempId,
      date: selectedDate,
      content: trimmed,
      isCompleted: false,
      sortOrder: todos.length,
    };

    onCreate(tempTodo);
    setNewContent('');

    startTransition(async () => {
      try {
        const created = await createTodo({ date: selectedDate, content: trimmed });
        if (created) {
          onCreated(tempId, created as Todo);
        }
      } catch {
        onDelete(tempId);
      }
    });
  };

  const handleToggle = (id: string, currentIsCompleted: boolean) => {
    onToggle(id, !currentIsCompleted);

    startTransition(async () => {
      try {
        await toggleTodo(id);
      } catch {
        onToggle(id, currentIsCompleted);
      }
    });
  };

  const handleDelete = (id: string) => {
    onDelete(id);

    startTransition(async () => {
      try {
        await deleteTodo(id);
      } catch {
        // Acceptable UX — visually removed
      }
    });
  };

  const handleUpdate = (id: string, content: string) => {
    onUpdate(id, content);
    startTransition(async () => {
      try {
        await updateTodo(id, { content });
      } catch {
        // rollback handled by next fetch
      }
    });
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const incomplete = todos.filter((t) => !t.isCompleted);
    const oldIdx = incomplete.findIndex((t) => t.id === active.id);
    const newIdx = incomplete.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = [...incomplete];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    const updated = reordered.map((t, i) => ({ ...t, sortOrder: i }));
    const completed = todos.filter((t) => t.isCompleted);
    onReorder([...updated, ...completed]);

    startTransition(async () => {
      try {
        await reorderTodos(updated.map((t) => ({ id: t.id, sortOrder: t.sortOrder })));
      } catch {
        // rollback handled by next fetch
      }
    });
  }, [todos, onReorder]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAdd();
    }
  };

  const incomplete = todos.filter((t) => !t.isCompleted);
  const completed = todos.filter((t) => t.isCompleted);

  return (
    <div className="space-y-2">
      {/* Add todo input */}
      <div className="flex gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="할 일 추가..."
          className="flex-1 h-9 text-base"
          disabled={isPending}
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !newContent.trim()}
          aria-label="할 일 추가"
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-md transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Incomplete todos — sortable */}
      {incomplete.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={incomplete.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {incomplete.map((todo) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                  isPending={isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Completed todos — collapsible */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs text-muted-foreground flex items-center gap-0.5 px-1 py-1 hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', showCompleted && 'rotate-90')} />
            완료 {completed.length}개
          </button>
          {showCompleted && (
            <div className="space-y-0.5 animate-fade-in">
              {completed.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Sortable wrapper ──────────────────────────────────────────────────────

function SortableTodoItem(props: {
  todo: Todo;
  onToggle: (id: string, currentIsCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  isPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TodoItem
      {...props}
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

// ─── TodoItem ──────────────────────────────────────────────────────────────

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string, currentIsCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  isPending: boolean;
  style?: React.CSSProperties;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

const TodoItem = forwardRef<HTMLDivElement, TodoItemProps>(function TodoItem(
  { todo, onToggle, onDelete, onUpdate, isPending, style, isDragging, dragHandleProps },
  ref,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(todo.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditContent(todo.content);
      setIsEditing(false);
      return;
    }
    if (trimmed !== todo.content) {
      onUpdate(todo.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditContent(todo.content);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'group flex items-center gap-1.5 px-1 py-1.5 rounded-md transition-colors',
        'hover:bg-muted/50',
        isDragging && 'opacity-50 shadow-lg z-10 bg-card',
      )}
    >
      {/* Drag handle — always visible for incomplete, hidden for completed */}
      {dragHandleProps ? (
        <button
          className="shrink-0 p-1 rounded text-muted-foreground/30 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing touch-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="드래그하여 순서 변경 (키보드: Space로 잡기, 방향키로 이동, Space/Enter로 놓기)"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-6 shrink-0" />
      )}

      <button
        onClick={() => onToggle(todo.id, todo.isCompleted)}
        disabled={isPending}
        aria-label={todo.isCompleted ? `${todo.content} 완료 취소` : `${todo.content} 완료 처리`}
        aria-pressed={todo.isCompleted}
        className="shrink-0 transition-transform active:scale-95 p-1 focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {todo.isCompleted
          ? <CheckCircle2 className="h-[18px] w-[18px] text-primary animate-check-bounce" />
          : <Circle className="h-[18px] w-[18px] text-muted-foreground/40 hover:text-muted-foreground/60" />
        }
      </button>

      {isEditing ? (
        <input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleEditKeyDown}
          className="flex-1 text-base bg-transparent border-b border-primary outline-none py-0"
          autoFocus
        />
      ) : (
        <span
          className={cn(
            'flex-1 text-sm transition-colors min-w-0 truncate',
            todo.isCompleted && 'line-through text-muted-foreground',
          )}
        >
          {todo.content}
        </span>
      )}

      {!isEditing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => { setEditContent(todo.content); setIsEditing(true); }}
            disabled={isPending || isEditing}
            aria-label={`${todo.content} 수정`}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isPending}
            aria-label={`${todo.content} 삭제`}
            className="p-1 rounded hover:bg-destructive/10 text-destructive/50 hover:text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>할 일을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{todo.content}&rdquo; 항목이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(todo.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
