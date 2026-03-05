'use client';

import {useState, useTransition} from 'react';
import {CheckCircle2, ChevronRight, Circle, Pencil, Plus, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {createTodo, deleteTodo, toggleTodo, updateTodo} from '@/lib/actions/todos';
import {Input} from '@/components/ui/input';
import type {Todo} from './types';

interface TodoListProps {
  todos: Todo[];
  selectedDate: string;
  onToggle: (todoId: string, isCompleted: boolean) => void;
  onCreate: (todo: Todo) => void;
  onCreated: (tempId: string, created: Todo) => void;
  onDelete: (todoId: string) => void;
  onUpdate: (todoId: string, content: string) => void;
}

export function TodoList({
  todos,
  selectedDate,
  onToggle,
  onCreate,
  onCreated,
  onDelete,
  onUpdate,
}: TodoListProps) {
  const [newContent, setNewContent] = useState('');
  const [isPending, startTransition] = useTransition();
  const [showCompleted, setShowCompleted] = useState(false);

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
          className="flex-1 h-9 text-sm"
          disabled={isPending}
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !newContent.trim()}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-md transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Incomplete todos */}
      {incomplete.length > 0 && (
        <div className="space-y-0.5">
          {incomplete.map((todo) => (
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

      {/* Empty state */}
      {todos.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          할 일이 없습니다
        </p>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onUpdate,
  isPending,
}: {
  todo: Todo;
  onToggle: (id: string, currentIsCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  isPending: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(todo.content);

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
      className={cn(
        'group flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors',
        'hover:bg-muted/50',
      )}
    >
      <button
        onClick={() => onToggle(todo.id, todo.isCompleted)}
        disabled={isPending}
        className="shrink-0 transition-transform active:scale-95"
      >
        {todo.isCompleted
          ? <CheckCircle2 className="h-[18px] w-[18px] text-primary" />
          : <Circle className="h-[18px] w-[18px] text-muted-foreground/40 hover:text-muted-foreground/60" />
        }
      </button>

      {isEditing ? (
        <input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleEditKeyDown}
          className="flex-1 text-sm bg-transparent border-b border-primary outline-none py-0"
          autoFocus
        />
      ) : (
        <span
          className={cn(
            'flex-1 text-sm transition-colors',
            todo.isCompleted && 'line-through text-muted-foreground',
          )}
        >
          {todo.content}
        </span>
      )}

      <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => { setEditContent(todo.content); setIsEditing(true); }}
          disabled={isPending || isEditing}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(todo.id)}
          disabled={isPending}
          className="p-1 rounded hover:bg-destructive/10 text-destructive/50 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
