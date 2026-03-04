'use client';

import {useState, useTransition} from 'react';
import {Check, Plus, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {createTodo, deleteTodo, toggleTodo} from '@/lib/actions/todos';
import {Input} from '@/components/ui/input';

interface Todo {
  id: string;
  date: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
}

interface TodoListProps {
  todos: Todo[];
  selectedDate: string;
  /** Called immediately when a todo is toggled so the parent can update its state optimistically. */
  onToggle: (todoId: string, isCompleted: boolean) => void;
  /** Called immediately with a temp todo so the parent can append it to its list. */
  onCreate: (todo: Todo) => void;
  /** Called once the server responds so the parent can swap the temp id for the real one. */
  onCreated: (tempId: string, created: Todo) => void;
  /** Called immediately so the parent can remove the todo from its list. */
  onDelete: (todoId: string) => void;
}

export function TodoList({
  todos,
  selectedDate,
  onToggle,
  onCreate,
  onCreated,
  onDelete,
}: TodoListProps) {
  const [newContent, setNewContent] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    // Build an optimistic todo with a temporary id
    const tempId = crypto.randomUUID();
    const tempTodo: Todo = {
      id: tempId,
      date: selectedDate,
      content: trimmed,
      isCompleted: false,
      sortOrder: todos.length,
    };

    // Update parent state immediately
    onCreate(tempTodo);
    setNewContent('');

    startTransition(async () => {
      try {
        const created = await createTodo({ date: selectedDate, content: trimmed });
        if (created) {
          // Swap the temp row with the real DB row
          onCreated(tempId, created as Todo);
        }
      } catch {
        // On failure roll back by removing the temp todo
        onDelete(tempId);
      }
    });
  };

  const handleToggle = (id: string, currentIsCompleted: boolean) => {
    // Flip optimistically before the server responds
    onToggle(id, !currentIsCompleted);

    startTransition(async () => {
      try {
        await toggleTodo(id);
      } catch {
        // Roll back on failure
        onToggle(id, currentIsCompleted);
      }
    });
  };

  const handleDelete = (id: string) => {
    // Remove from parent list immediately
    onDelete(id);

    startTransition(async () => {
      try {
        await deleteTodo(id);
      } catch {
        // Nothing to roll back here — the user already removed it visually.
        // A full page refresh would reconcile, but keeping it removed is acceptable UX.
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
    <div className="space-y-3">
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
        <div className="space-y-1">
          {incomplete.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDelete={handleDelete}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Completed todos */}
      {completed.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-1 pt-2">
            완료 ({completed.length})
          </p>
          {completed.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDelete={handleDelete}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {todos.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
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
  isPending,
}: {
  todo: Todo;
  onToggle: (id: string, currentIsCompleted: boolean) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
        'hover:bg-muted/50',
      )}
    >
      <button
        onClick={() => onToggle(todo.id, todo.isCompleted)}
        disabled={isPending}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
          todo.isCompleted
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border hover:border-primary/50',
        )}
      >
        {todo.isCompleted && <Check className="h-3 w-3" />}
      </button>

      <span
        className={cn(
          'flex-1 text-sm transition-colors',
          todo.isCompleted && 'line-through text-muted-foreground',
        )}
      >
        {todo.content}
      </span>

      <button
        onClick={() => onDelete(todo.id)}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
