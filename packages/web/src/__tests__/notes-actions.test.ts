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
  const _calls: Record<string, unknown[][]> = {};

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(_resolveValue).then(resolve);
      }
      if (prop === '_setResolve') {
        return (v: unknown) => { _resolveValue = v; };
      }
      if (prop === '_getCalls') {
        return (name: string) => _calls[name] ?? [];
      }
      if (prop === '_resetCalls') {
        return () => { for (const k of Object.keys(_calls)) delete _calls[k]; };
      }
      const name = String(prop);
      return vi.fn().mockImplementation((...args: unknown[]) => {
        (_calls[name] ??= []).push(args);
        return new Proxy({}, handler);
      });
    },
  };

  return { mockDb: new Proxy({}, handler) as Record<string, unknown> };
});

vi.mock('@forme/shared', () => ({
  db: mockDb,
  notes: {
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

function getDbCalls(name: string): unknown[][] {
  return (mockDb as Record<string, (n: string) => unknown[][]>)._getCalls(name);
}

function resetDbCalls() {
  (mockDb as Record<string, () => void>)._resetCalls();
}

describe('Notes Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    setDbResolve([{ id: 'test-id', isPinned: false, title: '', contentText: '' }]);
  });

  describe('createNote', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { createNote } = await import('@/lib/actions/notes');
      await expect(createNote()).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'new-id', title: '', content: {}, contentText: '' }]);
      const { createNote } = await import('@/lib/actions/notes');
      const result = await createNote();
      expect(result).toBeDefined();
      expect(result.id).toBe('new-id');
    });
  });

  describe('getNote', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { getNote } = await import('@/lib/actions/notes');
      await expect(getNote('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Unauthorized');
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { getNote } = await import('@/lib/actions/notes');
      await expect(getNote('invalid-id')).rejects.toThrow('잘못된 ID입니다');
    });

    it('should return null if note not found', async () => {
      setMockUser('user-123');
      setDbResolve([]);
      const { getNote } = await import('@/lib/actions/notes');
      const result = await getNote('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeNull();
    });
  });

  describe('updateNote', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { updateNote } = await import('@/lib/actions/notes');
      await expect(
        updateNote('550e8400-e29b-41d4-a716-446655440000', { title: 'Test' })
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw if title exceeds 200 characters', async () => {
      setMockUser('user-123');
      const { updateNote } = await import('@/lib/actions/notes');
      const longTitle = 'a'.repeat(201);
      await expect(
        updateNote('550e8400-e29b-41d4-a716-446655440000', { title: longTitle })
      ).rejects.toThrow('제목은 200자 이내여야 합니다');
    });

    it('should throw if contentText exceeds limit', async () => {
      setMockUser('user-123');
      const { updateNote } = await import('@/lib/actions/notes');
      const longContent = 'a'.repeat(50001);
      await expect(
        updateNote('550e8400-e29b-41d4-a716-446655440000', { contentText: longContent })
      ).rejects.toThrow('노트 내용은');
    });

    it('should throw if content is not valid TipTap JSON', async () => {
      setMockUser('user-123');
      const { updateNote } = await import('@/lib/actions/notes');
      await expect(
        updateNote('550e8400-e29b-41d4-a716-446655440000', {
          content: { type: 'invalid' },
        })
      ).rejects.toThrow('잘못된 콘텐츠 형식입니다');
    });

    it('should sanitize javascript: links in content', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', title: 'Test' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      const result = await updateNote('550e8400-e29b-41d4-a716-446655440000', {
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

    it('should sanitize javascript: link hrefs → empty string (regression)', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            }],
          }],
        },
      });
      const setCalls = getDbCalls('set');
      const payload = setCalls[0]?.[0] as { content: Record<string, unknown> };
      const serialized = JSON.stringify(payload.content);
      expect(serialized).not.toContain('javascript:');
      expect(serialized).toContain('"href":""');
    });

    it('should sanitize file:// image src → empty string (regression)', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'image',
            attrs: { src: 'file:///etc/passwd' },
          }],
        },
      });
      const setCalls = getDbCalls('set');
      const payload = setCalls[0]?.[0] as { content: Record<string, unknown> };
      const serialized = JSON.stringify(payload.content);
      expect(serialized).not.toContain('file://');
      expect(serialized).toContain('"src":""');
    });

    it('should strip <script> tags from imageBlock caption (XSS defense)', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'imageBlock',
            attrs: {
              src: 'https://cdn.example.com/a.png',
              caption: '<script>alert(1)</script>hello',
            },
          }],
        },
      });
      const setCalls = getDbCalls('set');
      const payload = setCalls[0]?.[0] as { content: Record<string, unknown> };
      const serialized = JSON.stringify(payload.content);
      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('</script>');
      // Textual content between stripped tags is preserved
      expect(serialized).toContain('alert(1)hello');
    });

    it('should strip <img onerror> payload from imageBlock caption (XSS defense)', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'imageBlock',
            attrs: {
              src: 'https://cdn.example.com/a.png',
              caption: 'pre<img src=x onerror="alert(1)">post',
            },
          }],
        },
      });
      const setCalls = getDbCalls('set');
      const payload = setCalls[0]?.[0] as { content: Record<string, unknown> };
      const serialized = JSON.stringify(payload.content);
      expect(serialized).not.toContain('<img');
      expect(serialized).not.toContain('onerror');
      expect(serialized).toContain('prepost');
    });

    it('should sanitize file:// src on imageBlock (regression)', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        content: {
          type: 'doc',
          content: [{
            type: 'imageBlock',
            attrs: {
              src: 'file:///etc/passwd',
              caption: 'clean',
            },
          }],
        },
      });
      const setCalls = getDbCalls('set');
      const payload = setCalls[0]?.[0] as { content: Record<string, unknown> };
      const serialized = JSON.stringify(payload.content);
      expect(serialized).not.toContain('file://');
      expect(serialized).toContain('"src":""');
      expect(serialized).toContain('"caption":"clean"');
    });

    it('should succeed with valid data', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', title: 'Updated' }]);
      const { updateNote } = await import('@/lib/actions/notes');
      const result = await updateNote('550e8400-e29b-41d4-a716-446655440000', {
        title: 'Updated',
      });
      expect(result).toBeDefined();
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { updateNote } = await import('@/lib/actions/notes');
      await expect(
        updateNote('bad-id', { title: 'Test' })
      ).rejects.toThrow('잘못된 ID입니다');
    });
  });

  describe('deleteNote', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { deleteNote } = await import('@/lib/actions/notes');
      await expect(deleteNote('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Unauthorized');
    });

    it('should succeed when authenticated', async () => {
      setMockUser('user-123');
      const { deleteNote } = await import('@/lib/actions/notes');
      await expect(
        deleteNote('550e8400-e29b-41d4-a716-446655440000')
      ).resolves.not.toThrow();
    });

    it('should throw if id is not valid UUID', async () => {
      setMockUser('user-123');
      const { deleteNote } = await import('@/lib/actions/notes');
      await expect(deleteNote('bad-id')).rejects.toThrow('잘못된 ID입니다');
    });
  });

  describe('toggleMemoPin', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { toggleMemoPin } = await import('@/lib/actions/notes');
      await expect(
        toggleMemoPin('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow('Unauthorized');
    });

    it('should toggle pin when authenticated', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: 'test-id', isPinned: true }]);
      const { toggleMemoPin } = await import('@/lib/actions/notes');
      const result = await toggleMemoPin('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeDefined();
    });
  });

  describe('searchNotes', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { searchNotes } = await import('@/lib/actions/notes');
      await expect(searchNotes('test')).rejects.toThrow('Unauthorized');
    });

    it('should return all notes for empty query', async () => {
      setMockUser('user-123');
      setDbResolve([{ id: '1', title: 'Test', contentText: 'text' }]);
      const { searchNotes } = await import('@/lib/actions/notes');
      const result = await searchNotes('  ');
      expect(result).toBeDefined();
    });

    it('should throw if query exceeds max length', async () => {
      setMockUser('user-123');
      const { searchNotes } = await import('@/lib/actions/notes');
      const longQuery = 'a'.repeat(201);
      await expect(searchNotes(longQuery)).rejects.toThrow('검색어는');
    });
  });

  describe('getRecentNotes', () => {
    it('should throw if not authenticated', async () => {
      setMockUser(null);
      const { getRecentNotes } = await import('@/lib/actions/notes');
      await expect(getRecentNotes()).rejects.toThrow('Unauthorized');
    });

    it('should clamp limit to max 20', async () => {
      setMockUser('user-123');
      setDbResolve([]);
      const { getRecentNotes } = await import('@/lib/actions/notes');
      const result = await getRecentNotes(100);
      expect(result).toBeDefined();
    });
  });
});
