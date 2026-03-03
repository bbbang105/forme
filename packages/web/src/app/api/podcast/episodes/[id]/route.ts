import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {db, podcastEpisodes} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {deleteFromR2, extractR2Key} from '@/lib/r2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/podcast/episodes/[id]
 * Update title and/or description.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid episode id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Partial<{ title: string; description: string | null }> = {};
  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    }
    if (trimmed.length > 500) {
      return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
    }
    updates.title = trimmed;
  }
  if (body.description !== undefined) {
    updates.description = body.description.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(podcastEpisodes)
      .set(updates)
      .where(and(eq(podcastEpisodes.id, id), eq(podcastEpisodes.userId, user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      description: updated.description ?? null,
    });
  } catch (err) {
    console.error('[PATCH /api/podcast/episodes/:id]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/podcast/episodes/[id]
 * Deletes the episode record and its R2 audio file.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid episode id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [episode] = await db
      .select({ audioUrl: podcastEpisodes.audioUrl })
      .from(podcastEpisodes)
      .where(and(eq(podcastEpisodes.id, id), eq(podcastEpisodes.userId, user.id)))
      .limit(1);

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Delete R2 file
    const r2Key = extractR2Key(episode.audioUrl);
    if (r2Key) {
      try {
        await deleteFromR2(r2Key);
      } catch (r2Err) {
        console.warn('[DELETE /api/podcast/episodes/:id] R2 delete failed:', r2Err);
        // Continue with DB deletion even if R2 fails
      }
    }

    await db
      .delete(podcastEpisodes)
      .where(and(eq(podcastEpisodes.id, id), eq(podcastEpisodes.userId, user.id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/podcast/episodes/:id]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
