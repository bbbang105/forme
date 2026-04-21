'use server';

import {getAuthUser} from '@/lib/auth';
import {traceAction, traceQuery} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';
import {db, notes} from '@forme/shared';
import {and, desc, eq, ilike, ne, or, sql} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';

const MAX_CONTENT_TEXT_LENGTH = 50000;
const MAX_CONTENT_JSON_SIZE = 500000;
const MAX_SEARCH_QUERY_LENGTH = 200;
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const ALLOWED_IMAGE_PROTOCOLS = ['http:', 'https:'];

function validateUUID(id: string) {
  if (!UUID_REGEX.test(id)) throw new Error('잘못된 ID입니다');
}

/** Sanitize TipTap JSON: validate structure and strip dangerous link protocols */
function sanitizeTipTapContent(content: Record<string, unknown>): Record<string, unknown> {
  if (content.type !== 'doc') {
    throw new Error('잘못된 콘텐츠 형식입니다');
  }
  const json = JSON.stringify(content);
  if (json.length > MAX_CONTENT_JSON_SIZE) {
    throw new Error('노트 내용이 너무 큽니다');
  }
  // Recursively sanitize link marks
  return sanitizeNode(content) as Record<string, unknown>;
}

/** Strip all HTML tags from a string. Used for text-only fields like image captions
 *  so that client renderers can safely insert the value into the DOM as textContent
 *  without any ambiguity. Belt-and-suspenders: the renderer in image-block.tsx also
 *  renders caption as React text children (no dangerouslySetInnerHTML). */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
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

  // Sanitize imageBlock — validate src (same as image) and strip HTML from caption
  if (obj.type === 'imageBlock' && obj.attrs && typeof obj.attrs === 'object') {
    const attrs = obj.attrs as Record<string, unknown>;
    const nextAttrs: Record<string, unknown> = { ...attrs };

    if (typeof attrs.src === 'string') {
      let srcAllowed = false;
      try {
        const url = new URL(attrs.src);
        srcAllowed = ALLOWED_IMAGE_PROTOCOLS.includes(url.protocol);
      } catch {
        srcAllowed = false;
      }
      if (!srcAllowed) {
        nextAttrs.src = '';
      }
    }

    if (typeof attrs.caption === 'string') {
      nextAttrs.caption = stripHtml(attrs.caption);
    }

    obj.attrs = nextAttrs;
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
const nonEmptyTitle = ne(sql`trim(coalesce(${notes.title}, ''))`, '');
const nonEmptyContent = ne(sql`trim(${notes.contentText})`, '');
/** Exclude ghost notes that were created but never edited */
const notEmpty = or(nonEmptyTitle, nonEmptyContent)!;

export async function getNotes() {
  return traceAction('getNotes', async () => {
    const user = await getAuthUser();

    return traceQuery('notes.list', () =>
      db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, user.id), notEmpty))
        .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    );
  });
}

export async function getNote(id: string) {
  return traceAction('getNote', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    const [row] = await traceQuery('notes.get', () =>
      db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, user.id),
          )
        )
    );

    return row ?? null;
  }, { id });
}

export async function createNote() {
  return traceAction('createNote', async () => {
    const user = await getAuthUser();

    const [row] = await traceQuery('notes.create', () =>
      db
        .insert(notes)
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

export async function updateNote(
  id: string,
  data: {
    title?: string;
    content?: Record<string, unknown>;
    contentText?: string;
    tags?: string[];
  }
) {
  return traceAction('updateNote', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    if (data.title !== undefined && data.title.length > 200) {
      throw new Error('제목은 200자 이내여야 합니다');
    }
    if (data.contentText !== undefined && data.contentText.length > MAX_CONTENT_TEXT_LENGTH) {
      throw new Error(`노트 내용은 ${MAX_CONTENT_TEXT_LENGTH.toLocaleString()}자 이내여야 합니다`);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) {
      // Empty content (new note) passes through, otherwise validate
      if (Object.keys(data.content).length > 0) {
        updates.content = sanitizeTipTapContent(data.content);
      } else {
        updates.content = data.content;
      }
    }
    if (data.contentText !== undefined) updates.contentText = data.contentText;
    if (data.tags !== undefined) updates.tags = validateTags(data.tags);

    const [row] = await traceQuery('notes.update', () =>
      db
        .update(notes)
        .set(updates)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, user.id),
          )
        )
        .returning()
    );

    // Content-only update — only the note list needs refreshing, not the dashboard widget
    revalidatePath('/notes');
    return row;
  }, { id });
}

export async function getNoteTags() {
  return traceAction('getNoteTags', async () => {
    const user = await getAuthUser();
    const rows = await traceQuery('notes.tags', () =>
      db
        .selectDistinct({ tag: sql<string>`unnest(${notes.tags})` })
        .from(notes)
        .where(eq(notes.userId, user.id))
    );
    return rows.map((r) => r.tag).filter(Boolean);
  });
}

export async function deleteNote(id: string) {
  return traceAction('deleteNote', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    await traceQuery('notes.delete', () =>
      db
        .delete(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, user.id),
          )
        )
    );

    // Deletion changes the dashboard recent-notes widget count
    revalidatePath('/notes');
    revalidatePath('/dashboard');
  }, { id });
}

export async function toggleNotePin(id: string) {
  return traceAction('toggleNotePin', async () => {
    const user = await getAuthUser();
    validateUUID(id);

    const [row] = await traceQuery('notes.toggle-pin', () =>
      db
        .update(notes)
        .set({
          isPinned: sql`NOT ${notes.isPinned}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, user.id),
          )
        )
        .returning()
    );

    if (!row) throw new Error('노트를 찾을 수 없습니다');

    // Pin toggling only reorders the note list — dashboard widget is unaffected
    revalidatePath('/notes');
    return row;
  }, { id });
}

export async function searchNotes(query: string) {
  return traceAction('searchNotes', async () => {
    const user = await getAuthUser();

    if (!query.trim()) return getNotes();
    if (query.trim().length > MAX_SEARCH_QUERY_LENGTH) {
      throw new Error(`검색어는 ${MAX_SEARCH_QUERY_LENGTH}자 이내여야 합니다`);
    }

    const escaped = escapeLikePattern(query.trim());
    const pattern = `%${escaped}%`;

    const rows = await traceQuery('notes.search', () =>
      db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.userId, user.id),
            or(
              ilike(notes.contentText, pattern),
              ilike(notes.title, pattern),
            ),
          )
        )
        .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    );

    return rows;
  }, { query });
}

const DEFAULT_PAGE_SIZE = 20;

export async function getNotesPage(offset = 0, limit = DEFAULT_PAGE_SIZE) {
  return traceAction('getNotesPage', async () => {
    const user = await getAuthUser();

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);

    const rows = await traceQuery('notes.page', () =>
      db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, user.id), notEmpty))
        .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
        .limit(safeLimit + 1) // fetch one extra to check if more exist
        .offset(safeOffset)
    );

    const hasMore = rows.length > safeLimit;

    return {
      notes: rows.slice(0, safeLimit),
      hasMore,
      nextOffset: safeOffset + safeLimit,
    };
  }, { offset, limit });
}

export async function getRecentNotes(limit = 3) {
  return traceAction('getRecentNotes', async () => {
    const user = await getAuthUser();

    const safeLimit = Math.min(Math.max(1, limit), 20);

    return traceQuery('notes.recent', () =>
      db
        .select()
        .from(notes)
        .where(and(eq(notes.userId, user.id), notEmpty))
        .orderBy(desc(notes.updatedAt))
        .limit(safeLimit)
    );
  }, { limit });
}
