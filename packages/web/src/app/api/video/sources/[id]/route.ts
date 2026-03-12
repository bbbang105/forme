import {NextResponse} from 'next/server';
import {and, eq} from 'drizzle-orm';
import {db, videoSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

export const PATCH = withTracing('PATCH /api/video/sources/[id]', async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.isFavorite === 'boolean') updates.isFavorite = body.isFavorite;
  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
  if (typeof body.favoriteOrder === 'number') updates.favoriteOrder = body.favoriteOrder;
  if (Array.isArray(body.tags)) {
    updates.tags = (body.tags as string[]).filter((t) => typeof t === 'string').map((t) => t.slice(0, 50)).slice(0, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const [updated] = await db.update(videoSources)
    .set(updates)
    .where(and(eq(videoSources.id, id), eq(videoSources.userId, user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
});

export const DELETE = withTracing('DELETE /api/video/sources/[id]', async (_request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await db.delete(videoSources)
    .where(and(eq(videoSources.id, id), eq(videoSources.userId, user.id)))
    .returning({ id: videoSources.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
});
