import {beforeEach, describe, expect, it, vi} from 'vitest';

/**
 * Guards for Todo Server Actions — focuses on auth → validation order
 * per CLAUDE.md convention "인증 → 입력 검증 → 비즈니스 로직".
 *
 * Unauthenticated callers must always see an `Unauthorized` error,
 * even when the input is also malformed. A prior implementation threw
 * "잘못된 ID" first which leaked the validation surface before auth.
 */

// --- Mocks ---

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

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

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => {
          _resolveValue = v;
        };
      }
      return vi.fn().mockImplementation(() => new Proxy({}, handler));
    },
  };

  return {mockDb: new Proxy({}, handler) as Record<string, unknown>};
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  todos: {
    id: 'id',
    userId: 'user_id',
    date: 'date',
    content: 'content',
    isCompleted: 'is_completed',
    sortOrder: 'sort_order',
  },
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';

describe('updateTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([{id: 'test-id', content: 'Updated'}]);
  });

  it('throws Unauthorized before input validation when not authenticated', async () => {
    setMockUser(null);
    const {updateTodo} = await import('@/lib/actions/todos');
    // Intentionally pass an invalid UUID — auth should fire FIRST.
    await expect(updateTodo('bad-id', {content: 'x'})).rejects.toThrow('Unauthorized');
  });

  it('throws on invalid UUID when authenticated', async () => {
    setMockUser('user-123');
    const {updateTodo} = await import('@/lib/actions/todos');
    await expect(updateTodo('not-a-uuid', {content: 'x'})).rejects.toThrow('잘못된 ID입니다');
  });

  it('succeeds with a valid UUID + content', async () => {
    setMockUser('user-123');
    const {updateTodo} = await import('@/lib/actions/todos');
    await expect(
      updateTodo(VALID_UUID, {content: 'Buy milk'})
    ).resolves.toBeDefined();
  });
});

describe('deleteTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([]);
  });

  it('throws Unauthorized before UUID validation when not authenticated', async () => {
    setMockUser(null);
    const {deleteTodo} = await import('@/lib/actions/todos');
    await expect(deleteTodo('bad-id')).rejects.toThrow('Unauthorized');
  });

  it('throws on invalid UUID when authenticated', async () => {
    setMockUser('user-123');
    const {deleteTodo} = await import('@/lib/actions/todos');
    await expect(deleteTodo('not-a-uuid')).rejects.toThrow('잘못된 ID입니다');
  });

  it('succeeds with a valid UUID', async () => {
    setMockUser('user-123');
    const {deleteTodo} = await import('@/lib/actions/todos');
    await expect(deleteTodo(VALID_UUID)).resolves.not.toThrow();
  });
});

describe('toggleTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([{id: 'test-id', isCompleted: true}]);
  });

  it('throws Unauthorized before UUID validation when not authenticated', async () => {
    setMockUser(null);
    const {toggleTodo} = await import('@/lib/actions/todos');
    await expect(toggleTodo('bad-id')).rejects.toThrow('Unauthorized');
  });

  it('throws on invalid UUID when authenticated', async () => {
    setMockUser('user-123');
    const {toggleTodo} = await import('@/lib/actions/todos');
    await expect(toggleTodo('not-a-uuid')).rejects.toThrow('잘못된 ID입니다');
  });

  it('succeeds with a valid UUID', async () => {
    setMockUser('user-123');
    setDbResolve([{id: VALID_UUID, isCompleted: true}]);
    const {toggleTodo} = await import('@/lib/actions/todos');
    await expect(toggleTodo(VALID_UUID)).resolves.toBeDefined();
  });
});
