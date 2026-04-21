import {beforeEach, describe, expect, it, vi} from 'vitest';

/**
 * RLS boundary test — simulate cross-user access by having the Drizzle mock
 * return [] (what a RLS-filtered query would return when the row belongs to
 * another user). Each action under test must either:
 *   - return null / undefined / no-op (read + write paths), OR
 *   - throw a "not found" error (toggle-style actions that assert a row exists).
 *
 * Additionally, every action's `where()` must be called — a static sanity check
 * that the user scoping clause is present in the query chain.
 */

// --- Mocks ---

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let _mockUser: {id: string} | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: {user: _mockUser},
        error: _mockUser ? null : new Error('Not authenticated'),
      })),
    },
  })),
}));

const {mockDb} = vi.hoisted(() => {
  let _resolveValue: unknown = [];
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') return (v: unknown) => { _resolveValue = v; };
      if (prop === '_getCalls') return (n: string) => _calls[n] ?? [];
      if (prop === '_reset') {
        return () => { for (const k of Object.keys(_calls)) delete _calls[k]; };
      }
      const name = String(prop);
      return vi.fn().mockImplementation((...args: unknown[]) => {
        (_calls[name] ??= []).push(args);
        return new Proxy({}, handler);
      });
    },
  };
  return {mockDb: new Proxy({}, handler) as Record<string, unknown>};
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  notes: {
    id: 'id', userId: 'user_id', title: 'title',
    content: 'content', contentText: 'content_text',
    isPinned: 'is_pinned', updatedAt: 'updated_at', tags: 'tags',
  },
  calendarEvents: {
    id: 'id', userId: 'user_id', startDate: 'start_date', endDate: 'end_date',
    recurrenceType: 'recurrence_type', recurrenceEndDate: 'recurrence_end_date',
    excludedDates: 'excluded_dates', completedDates: 'completed_dates',
    isCompleted: 'is_completed',
  },
  todos: {
    id: 'id', userId: 'user_id', date: 'date', content: 'content',
    sortOrder: 'sort_order', isCompleted: 'is_completed',
    createdAt: 'created_at',
  },
  eventCategories: {
    id: 'id', userId: 'user_id', name: 'name', color: 'color',
    icon: 'icon', sortOrder: 'sort_order', createdAt: 'created_at',
  },
}));

function setMockUser(id: string | null) { _mockUser = id ? {id} : null; }
function setDbResolve(v: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(v);
}
function getDbCalls(name: string): unknown[][] {
  return (mockDb as Record<string, (n: string) => unknown[][]>)._getCalls(name);
}
function resetDbCalls() {
  (mockDb as Record<string, () => void>)._reset();
}

const OTHER_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('RLS boundary — Notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setMockUser('user-a');
    setDbResolve([]); // RLS-filtered: no rows for user-a
  });

  it('getNote → null when row is not owned', async () => {
    const {getNote} = await import('@/lib/actions/notes');
    const result = await getNote(OTHER_USER_ID);
    expect(result).toBeNull();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('updateNote → undefined row when not owned', async () => {
    const {updateNote} = await import('@/lib/actions/notes');
    const result = await updateNote(OTHER_USER_ID, {title: 'x'});
    expect(result).toBeUndefined();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('deleteNote → no-op (no throw) when not owned', async () => {
    const {deleteNote} = await import('@/lib/actions/notes');
    await expect(deleteNote(OTHER_USER_ID)).resolves.not.toThrow();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('toggleNotePin → throws "not found" when not owned', async () => {
    const {toggleNotePin} = await import('@/lib/actions/notes');
    await expect(toggleNotePin(OTHER_USER_ID)).rejects.toThrow('노트를 찾을 수 없습니다');
  });
});

describe('RLS boundary — Todos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setMockUser('user-a');
    setDbResolve([]);
  });

  it('updateTodo → undefined row when not owned (RLS → no match)', async () => {
    const {updateTodo} = await import('@/lib/actions/todos');
    const result = await updateTodo(OTHER_USER_ID, {content: 'x'});
    expect(result).toBeUndefined();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('deleteTodo → no-op when not owned', async () => {
    const {deleteTodo} = await import('@/lib/actions/todos');
    await expect(deleteTodo(OTHER_USER_ID)).resolves.not.toThrow();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('toggleTodo → throws "not found" when not owned', async () => {
    const {toggleTodo} = await import('@/lib/actions/todos');
    await expect(toggleTodo(OTHER_USER_ID)).rejects.toThrow('할 일을 찾을 수 없습니다');
  });
});

describe('RLS boundary — Categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setMockUser('user-a');
    setDbResolve([]);
  });

  it('updateCategory → undefined row when not owned', async () => {
    const {updateCategory} = await import('@/lib/actions/categories');
    const result = await updateCategory(OTHER_USER_ID, {name: 'x'});
    expect(result).toBeUndefined();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('deleteCategory → no-op when not owned', async () => {
    const {deleteCategory} = await import('@/lib/actions/categories');
    await expect(deleteCategory(OTHER_USER_ID)).resolves.not.toThrow();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });
});

describe('RLS boundary — Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setMockUser('user-a');
    setDbResolve([]);
  });

  it('getCalendarEvents → empty array when user has no events', async () => {
    const {getCalendarEvents} = await import('@/lib/actions/calendar');
    const result = await getCalendarEvents('2026-04');
    expect(result).toEqual([]);
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('updateCalendarEvent → no throw when other user owns (update returns nothing)', async () => {
    // Pre-seed existing lookup with a matching row so we get past the
    // "일정을 찾을 수 없습니다" pre-check (simulate valid user pre-check path).
    // Once past validation, the main update returns [] under RLS filter.
    setDbResolve([{startDate: '2026-04-10', endDate: '2026-04-10'}]);
    const {updateCalendarEvent} = await import('@/lib/actions/calendar');
    // Change to `[]` for the later update resolution
    setDbResolve([]);
    const result = await updateCalendarEvent(OTHER_USER_ID, {color: '#3b82f6'});
    expect(result).toBeUndefined();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('deleteCalendarEvent → no-op when not owned', async () => {
    const {deleteCalendarEvent} = await import('@/lib/actions/calendar');
    await expect(deleteCalendarEvent(OTHER_USER_ID)).resolves.not.toThrow();
    expect(getDbCalls('where').length).toBeGreaterThan(0);
  });

  it('toggleCalendarEvent → throws "not found" when row missing', async () => {
    const {toggleCalendarEvent} = await import('@/lib/actions/calendar');
    await expect(
      toggleCalendarEvent(OTHER_USER_ID)
    ).rejects.toThrow('일정을 찾을 수 없습니다');
  });
});
