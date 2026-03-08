import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationSources, db} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

export const PATCH = withTracing('PATCH /api/curation/sources/[id]', async (request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  // Auth first
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }

  let body: { name?: string; category?: string; isActive?: boolean; isFavorite?: boolean; tags?: string[]; rssUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Partial<{
    name: string;
    category: string;
    isActive: boolean;
    isFavorite: boolean;
    tags: string[];
    rssUrl: string | null;
  }> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json(
        { error: 'name must be a non-empty string' },
        { status: 400 }
      );
    }
    if (body.name.trim().length > 200) {
      return NextResponse.json(
        { error: 'name must be 200 characters or fewer' },
        { status: 400 }
      );
    }
    updates.name = body.name.trim();
  }

  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || body.category.trim() === '') {
      return NextResponse.json(
        { error: 'category must be a non-empty string' },
        { status: 400 }
      );
    }
    if (body.category.trim().length > 50) {
      return NextResponse.json(
        { error: 'category must be 50 characters or fewer' },
        { status: 400 }
      );
    }
    updates.category = body.category.trim();
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean' },
        { status: 400 }
      );
    }
    updates.isActive = body.isActive;
  }

  if (body.isFavorite !== undefined) {
    if (typeof body.isFavorite !== 'boolean') {
      return NextResponse.json(
        { error: 'isFavorite must be a boolean' },
        { status: 400 }
      );
    }
    updates.isFavorite = body.isFavorite;
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string')) {
      return NextResponse.json(
        { error: 'tags must be an array of strings' },
        { status: 400 }
      );
    }
    updates.tags = body.tags;
  }

  if (body.rssUrl !== undefined) {
    if (body.rssUrl !== null && typeof body.rssUrl !== 'string') {
      return NextResponse.json(
        { error: 'rssUrl must be a string or null' },
        { status: 400 }
      );
    }
    updates.rssUrl = body.rssUrl ? body.rssUrl.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided for update' },
      { status: 400 }
    );
  }

  try {
    const [updated] = await db
      .update(curationSources)
      .set(updates)
      .where(
        and(
          eq(curationSources.id, id),
          eq(curationSources.userId, user.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PATCH /api/curation/sources/:id]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withTracing('DELETE /api/curation/sources/[id]', async (_request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  // Auth first
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(curationSources)
      .where(
        and(
          eq(curationSources.id, id),
          eq(curationSources.userId, user.id)
        )
      )
      .returning({ id: curationSources.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/curation/sources/:id]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
