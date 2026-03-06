import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Track the mock user for auth
let _mockUser: { id: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: _mockUser },
        error: _mockUser ? null : new Error('Not authenticated'),
      })),
    },
  })),
}));

// Simple chainable db mock using vi.hoisted
const { mockDb } = vi.hoisted(() => {
  let _resolveValue: unknown = [];

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => { _resolveValue = v; };
      }
      // Return a function that returns the proxy again (chainable)
      return vi.fn().mockImplementation(() => new Proxy({}, handler));
    },
  };

  return { mockDb: new Proxy({}, handler) as Record<string, unknown> };
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  calendarEvents: {
    id: 'id', userId: 'user_id', title: 'title',
    startDate: 'start_date', endDate: 'end_date',
    color: 'color', description: 'description',
  },
  todos: {
    id: 'id', userId: 'user_id', date: 'date',
    content: 'content', isCompleted: 'is_completed', sortOrder: 'sort_order',
  },
}));

function setMockUser(userId: string | null) {
  _mockUser = userId ? { id: userId } : null;
}

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

describe('Calendar Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([{ id: 'test-id' }]);
  });

  describe('createCalendarEvent', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { createCalendarEvent } = await import('@/lib/actions/calendar');
      await expect(
        createCalendarEvent({
          title: 'Test', startDate: '2026-03-04',
          endDate: '2026-03-04', color: '#3b82f6',
        })
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw if title is empty', async () => {
      setMockUser('user-123');
      const { createCalendarEvent } = await import('@/lib/actions/calendar');
      await expect(
        createCalendarEvent({
          title: '   ', startDate: '2026-03-04',
          endDate: '2026-03-04', color: '#3b82f6',
        })
      ).rejects.toThrow('제목을 입력해주세요');
    });

    it('should throw if end date before start date', async () => {
      setMockUser('user-123');
      const { createCalendarEvent } = await import('@/lib/actions/calendar');
      await expect(
        createCalendarEvent({
          title: 'Test', startDate: '2026-03-05',
          endDate: '2026-03-04', color: '#3b82f6',
        })
      ).rejects.toThrow('종료일은 시작일 이후여야 합니다');
    });

    it('should succeed with valid data', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'new-id', title: 'Test' }]);
      const { createCalendarEvent } = await import('@/lib/actions/calendar');
      const result = await createCalendarEvent({
        title: 'Test Event', startDate: '2026-03-04',
        endDate: '2026-03-05', color: '#3b82f6',
      });
      expect(result).toEqual({ id: 'new-id', title: 'Test' });
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { deleteCalendarEvent } = await import('@/lib/actions/calendar');
      await expect(deleteCalendarEvent('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      const { deleteCalendarEvent } = await import('@/lib/actions/calendar');
      await expect(deleteCalendarEvent('550e8400-e29b-41d4-a716-446655440000')).resolves.not.toThrow();
    });
  });
});

describe('Todo Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([{ id: 'test-id', maxOrder: 2, isCompleted: false }]);
  });

  describe('createTodo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { createTodo } = await import('@/lib/actions/todos');
      await expect(
        createTodo({ date: '2026-03-04', content: 'Test' })
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw if content is empty', async () => {
      setMockUser('user-123');
      const { createTodo } = await import('@/lib/actions/todos');
      await expect(
        createTodo({ date: '2026-03-04', content: '  ' })
      ).rejects.toThrow('내용을 입력해주세요');
    });

    it('should succeed with valid data', async () => {
      setMockUser('user-123');
      const { createTodo } = await import('@/lib/actions/todos');
      const result = await createTodo({ date: '2026-03-04', content: 'Buy groceries' });
      expect(result).toBeDefined();
    });
  });

  describe('toggleTodo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { toggleTodo } = await import('@/lib/actions/todos');
      await expect(toggleTodo('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow('Unauthorized');
    });

    it('should toggle todo when authenticated', async () => {
      setMockUser('user-123');
      const { toggleTodo } = await import('@/lib/actions/todos');
      const result = await toggleTodo('550e8400-e29b-41d4-a716-446655440001');
      expect(result).toBeDefined();
    });
  });

  describe('deleteTodo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { deleteTodo } = await import('@/lib/actions/todos');
      await expect(deleteTodo('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      const { deleteTodo } = await import('@/lib/actions/todos');
      await expect(deleteTodo('550e8400-e29b-41d4-a716-446655440001')).resolves.not.toThrow();
    });
  });
});
