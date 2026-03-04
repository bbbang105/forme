'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {db, memos} from '@forme/shared';
import {and, desc, eq, ilike, ne, or, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT_TEXT_LENGTH = 50000;
const MAX_CONTENT_JSON_SIZE = 500000;
const MAX_SEARCH_QUERY_LENGTH = 200;
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const ALLOWED_IMAGE_PROTOCOLS = ['http:', 'https:'];

function validateUUID(id: string) {
  if (!UUID_REGEX.test(id)) throw new Error('Invalid ID');
}

/** Sanitize TipTap JSON: validate structure and strip dangerous link protocols */
function sanitizeTipTapContent(content: Record<string, unknown>): Record<string, unknown> {
  if (content.type !== 'doc') {
    throw new Error('Invalid content format');
  }
  const json = JSON.stringify(content);
  if (json.length > MAX_CONTENT_JSON_SIZE) {
    throw new Error('메모 내용이 너무 큽니다');
  }
  // Recursively sanitize link marks
  return sanitizeNode(content) as Record<string, unknown>;
}

function sanitizeNode(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(sanitizeNode);

  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Validate image src — only http: and https: allowed
  if (obj.type === 'image' && obj.attrs && typeof obj.attrs === 'object') {
    const attrs = obj.attrs as Record<string, unknown>;
    if (typeof attrs.src === 'string') {
      let srcAllowed = false;
      try {
        const url = new URL(attrs.src);
        srcAllowed = ALLOWED_IMAGE_PROTOCOLS.includes(url.protocol);
      } catch {
        srcAllowed = false;
      }
      if (!srcAllowed) {
        // Strip dangerous src, continue processing remaining keys normally
        obj.attrs = { ...attrs, src: '' };
      }
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'marks' && Array.isArray(value)) {
      result[key] = value.map((mark: Record<string, unknown>) => {
        if (mark.type === 'link' && mark.attrs && typeof mark.attrs === 'object') {
          const attrs = mark.attrs as Record<string, unknown>;
          if (typeof attrs.href === 'string') {
            try {
              const url = new URL(attrs.href);
              if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) {
                return { ...mark, attrs: { ...attrs, href: '' } };
              }
            } catch {
              return { ...mark, attrs: { ...attrs, href: '' } };
            }
          }
        }
        return mark;
      });
    } else {
      result[key] = sanitizeNode(value);
    }
  }
  return result;
}

function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/** SQL expression: trim(coalesce(col, '')) != '' */
const nonEmptyTitle = ne(sql`trim(coalesce(${memos.title}, ''))`, '');
const nonEmptyContent = ne(sql`trim(${memos.contentText})`, '');
/** Exclude ghost memos that were created but never edited */
const notEmpty = or(nonEmptyTitle, nonEmptyContent)!;

export async function getMemos() {
  return traceAction('getMemos', async () => {
    const user = await getAuthUser();

    return traceQuery('memos.list', () =>
      db
        .select()
        .from(memos)
        .where(and(eq(memos.userId, user.id), notEmpty))
        .orderBy(desc(memos.isPinned), desc(memos.updatedAt))
    );
  });
}

export async function getMemo(id: string) {
  return traceAction('getMemo', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    const [row] = await traceQuery('memos.get', () =>
      db
        .select()
        .from(memos)
        .where(
          and(
            eq(memos.id, id),
            eq(memos.userId, user.id),
          )
        )
    );

    return row ?? null;
  }, { id });
}

export async function createMemo() {
  return traceAction('createMemo', async () => {
    const user = await getAuthUser();

    const [row] = await traceQuery('memos.create', () =>
      db
        .insert(memos)
        .values({
          userId: user.id,
          title: '',
          content: {},
          contentText: '',
        })
        .returning()
    );

    return row;
  });
}

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

function validateTags(tags: string[]): string[] {
  if (tags.length > MAX_TAGS) {
    throw new Error(`태그는 최대 ${MAX_TAGS}개까지 추가할 수 있습니다`);
  }
  return tags.map((t) => {
    const trimmed = t.trim();
    if (trimmed.length === 0) throw new Error('태그는 공백일 수 없습니다');
    if (trimmed.length > MAX_TAG_LENGTH) {
      throw new Error(`태그는 ${MAX_TAG_LENGTH}자 이내여야 합니다`);
    }
    return trimmed;
  });
}

export async function updateMemo(
  id: string,
  data: {
    title?: string;
    content?: Record<string, unknown>;
    contentText?: string;
    tags?: string[];
  }
) {
  return traceAction('updateMemo', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    if (data.title !== undefined && data.title.length > 200) {
      throw new Error('제목은 200자 이내여야 합니다');
    }
    if (data.contentText !== undefined && data.contentText.length > MAX_CONTENT_TEXT_LENGTH) {
      throw new Error(`메모 내용은 ${MAX_CONTENT_TEXT_LENGTH.toLocaleString()}자 이내여야 합니다`);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) {
      // Empty content (new memo) passes through, otherwise validate
      if (Object.keys(data.content).length > 0) {
        updates.content = sanitizeTipTapContent(data.content);
      } else {
        updates.content = data.content;
      }
    }
    if (data.contentText !== undefined) updates.contentText = data.contentText;
    if (data.tags !== undefined) updates.tags = validateTags(data.tags);

    const [row] = await traceQuery('memos.update', () =>
      db
        .update(memos)
        .set(updates)
        .where(
          and(
            eq(memos.id, id),
            eq(memos.userId, user.id),
          )
        )
        .returning()
    );

    // Content-only update — only the memo list needs refreshing, not the dashboard widget
    revalidatePath('/memo');
    return row;
  }, { id });
}

export async function getMemoTags() {
  return traceAction('getMemoTags', async () => {
    const user = await getAuthUser();
    const rows = await traceQuery('memos.tags', () =>
      db
        .selectDistinct({ tag: sql<string>`unnest(${memos.tags})` })
        .from(memos)
        .where(eq(memos.userId, user.id))
    );
    return rows.map((r) => r.tag).filter(Boolean);
  });
}

export async function deleteMemo(id: string) {
  return traceAction('deleteMemo', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    await traceQuery('memos.delete', () =>
      db
        .delete(memos)
        .where(
          and(
            eq(memos.id, id),
            eq(memos.userId, user.id),
          )
        )
    );

    // Deletion changes the dashboard recent-memos widget count
    revalidatePath('/memo');
    revalidatePath('/dashboard');
  }, { id });
}

export async function toggleMemoPin(id: string) {
  return traceAction('toggleMemoPin', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    const [row] = await traceQuery('memos.toggle-pin', () =>
      db
        .update(memos)
        .set({
          isPinned: sql`NOT ${memos.isPinned}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(memos.id, id),
            eq(memos.userId, user.id),
          )
        )
        .returning()
    );

    if (!row) throw new Error('Memo not found');

    // Pin toggling only reorders the memo list — dashboard widget is unaffected
    revalidatePath('/memo');
    return row;
  }, { id });
}

export async function searchMemos(query: string) {
  return traceAction('searchMemos', async () => {
    const user = await getAuthUser();

    if (!query.trim()) return getMemos();
    if (query.trim().length > MAX_SEARCH_QUERY_LENGTH) {
      throw new Error(`검색어는 ${MAX_SEARCH_QUERY_LENGTH}자 이내여야 합니다`);
    }

    const escaped = escapeLikePattern(query.trim());
    const pattern = `%${escaped}%`;

    const rows = await traceQuery('memos.search', () =>
      db
        .select()
        .from(memos)
        .where(
          and(
            eq(memos.userId, user.id),
            or(
              ilike(memos.contentText, pattern),
              ilike(memos.title, pattern),
            ),
          )
        )
        .orderBy(desc(memos.isPinned), desc(memos.updatedAt))
    );

    return rows;
  }, { query });
}

const DEFAULT_PAGE_SIZE = 20;

export async function getMemosPage(offset = 0, limit = DEFAULT_PAGE_SIZE) {
  return traceAction('getMemosPage', async () => {
    const user = await getAuthUser();

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);

    const rows = await traceQuery('memos.page', () =>
      db
        .select()
        .from(memos)
        .where(and(eq(memos.userId, user.id), notEmpty))
        .orderBy(desc(memos.isPinned), desc(memos.updatedAt))
        .limit(safeLimit + 1) // fetch one extra to check if more exist
        .offset(safeOffset)
    );

    const hasMore = rows.length > safeLimit;

    return {
      memos: rows.slice(0, safeLimit),
      hasMore,
      nextOffset: safeOffset + safeLimit,
    };
  }, { offset, limit });
}

export async function getRecentMemos(limit = 3) {
  return traceAction('getRecentMemos', async () => {
    const user = await getAuthUser();

    const safeLimit = Math.min(Math.max(1, limit), 20);

    return traceQuery('memos.recent', () =>
      db
        .select()
        .from(memos)
        .where(and(eq(memos.userId, user.id), notEmpty))
        .orderBy(desc(memos.updatedAt))
        .limit(safeLimit)
    );
  }, { limit });
}
