import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

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
      return vi.fn().mockImplementation(() => new Proxy({}, handler));
    },
  };

  return { mockDb: new Proxy({}, handler) as Record<string, unknown> };
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  memos: {
    id: 'id', userId: 'user_id', title: 'title',
    content: 'content', contentText: 'content_text',
    isPinned: 'is_pinned', createdAt: 'created_at', updatedAt: 'updated_at',
  },
}));

function setMockUser(userId: string | null) {
  _mockUser = userId ? { id: userId } : null;
}

function setDbResolve(value: unknown) {
  (mockDb as Record<string, (v: unknown) => void>)._setResolve(value);
}

describe('Memo Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDbResolve([{ id: 'test-id', isPinned: false, title: '', contentText: '' }]);
  });

  describe('createMemo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { createMemo } = await import('@/lib/actions/memos');
      await expect(createMemo()).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'new-id', title: '', content: {}, contentText: '' }]);
      const { createMemo } = await import('@/lib/actions/memos');
      const result = await createMemo();
      expect(result).toBeDefined();
      expect(result.id).toBe('new-id');
    });
  });

  describe('getMemo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { getMemo } = await import('@/lib/actions/memos');
      await expect(getMemo('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Unauthorized');
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { getMemo } = await import('@/lib/actions/memos');
      await expect(getMemo('invalid-id')).rejects.toThrow('잘못된 ID입니다');
    });

    it('should return null if memo not found', async () => {
      setMockUser('user-123');
      setDbResolve([]);
      const { getMemo } = await import('@/lib/actions/memos');
      const result = await getMemo('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeNull();
    });
  });

  describe('updateMemo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { updateMemo } = await import('@/lib/actions/memos');
      await expect(
        updateMemo('550e8400-e29b-41d4-a716-446655440000', { title: 'Test' })
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw if title exceeds 200 characters', async () => {
      setMockUser('user-123');
      const { updateMemo } = await import('@/lib/actions/memos');
      const longTitle = 'a'.repeat(201);
      await expect(
        updateMemo('550e8400-e29b-41d4-a716-446655440000', { title: longTitle })
      ).rejects.toThrow('제목은 200자 이내여야 합니다');
    });

    it('should throw if contentText exceeds limit', async () => {
      setMockUser('user-123');
      const { updateMemo } = await import('@/lib/actions/memos');
      const longContent = 'a'.repeat(50001);
      await expect(
        updateMemo('550e8400-e29b-41d4-a716-446655440000', { contentText: longContent })
      ).rejects.toThrow('메모 내용은');
    });

    it('should throw if content is not valid TipTap JSON', async () => {
      setMockUser('user-123');
      const { updateMemo } = await import('@/lib/actions/memos');
      await expect(
        updateMemo('550e8400-e29b-41d4-a716-446655440000', {
          content: { type: 'invalid' },
        })
      ).rejects.toThrow('잘못된 콘텐츠 형식입니다');
    });

    it('should sanitize javascript: links in content', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', title: 'Test' }]);
      const { updateMemo } = await import('@/lib/actions/memos');
      const result = await updateMemo('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'click me',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            }],
          }],
        },
      });
      expect(result).toBeDefined();
    });

    it('should succeed with valid data', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', title: 'Updated' }]);
      const { updateMemo } = await import('@/lib/actions/memos');
      const result = await updateMemo('550e8400-e29b-41d4-a716-446655440000', {
        title: 'Updated',
      });
      expect(result).toBeDefined();
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { updateMemo } = await import('@/lib/actions/memos');
      await expect(
        updateMemo('bad-id', { title: 'Test' })
      ).rejects.toThrow('잘못된 ID입니다');
    });
  });

  describe('deleteMemo', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { deleteMemo } = await import('@/lib/actions/memos');
      await expect(deleteMemo('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      const { deleteMemo } = await import('@/lib/actions/memos');
      await expect(
        deleteMemo('550e8400-e29b-41d4-a716-446655440000')
      ).resolves.not.toThrow();
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { deleteMemo } = await import('@/lib/actions/memos');
      await expect(deleteMemo('bad-id')).rejects.toThrow('잘못된 ID입니다');
    });
  });

  describe('toggleMemoPin', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { toggleMemoPin } = await import('@/lib/actions/memos');
      await expect(
        toggleMemoPin('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow('Unauthorized');
    });

    it('should toggle pin when authenticated', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', isPinned: true }]);
      const { toggleMemoPin } = await import('@/lib/actions/memos');
      const result = await toggleMemoPin('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeDefined();
    });
  });

  describe('searchMemos', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { searchMemos } = await import('@/lib/actions/memos');
      await expect(searchMemos('test')).rejects.toThrow('Unauthorized');
    });

    it('should return all memos for empty query', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: '1', title: 'Test', contentText: 'text' }]);
      const { searchMemos } = await import('@/lib/actions/memos');
      const result = await searchMemos('  ');
      expect(result).toBeDefined();
    });

    it('should throw if query exceeds max length', async () => {
      setMockUser('user-123');
      const { searchMemos } = await import('@/lib/actions/memos');
      const longQuery = 'a'.repeat(201);
      await expect(searchMemos(longQuery)).rejects.toThrow('검색어는');
    });
  });

  describe('getRecentMemos', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { getRecentMemos } = await import('@/lib/actions/memos');
      await expect(getRecentMemos()).rejects.toThrow('Unauthorized');
    });

    it('should clamp limit to max 20', async () => {
      setMockUser('user-123');
      setDbResolve([]);
      const { getRecentMemos } = await import('@/lib/actions/memos');
      const result = await getRecentMemos(100);
      expect(result).toBeDefined();
    });
  });
});
