import {NextResponse} from 'next/server';
import {and, eq} from 'drizzle-orm';
import {db, videoSources} from '@forme/shared';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';
import {UUID_REGEX} from '@/lib/validators';

export const PUT = withTracing('PUT /api/video/sources/reorder', async (request: Request) => {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  let body: {items?: {id: string; favoriteOrder: number}[]};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({error: 'items required'}, {status: 400});
  }
  if (body.items.length > 50) {
    return NextResponse.json({error: 'Too many items'}, {status: 400});
  }

  const ids = new Set<string>();
  for (const item of body.items) {
    if (!UUID_REGEX.test(item.id)) {
      return NextResponse.json({error: 'Invalid id'}, {status: 400});
    }
    if (ids.has(item.id)) {
      return NextResponse.json({error: 'Duplicate id'}, {status: 400});
    }
    ids.add(item.id);
    if (typeof item.favoriteOrder !== 'number' || !Number.isInteger(item.favoriteOrder) || item.favoriteOrder < 0 || item.favoriteOrder > 10_000) {
      return NextResponse.json({error: 'Invalid favoriteOrder'}, {status: 400});
    }
  }

  await Promise.all(
    body.items.map((item) =>
      db.update(videoSources)
        .set({favoriteOrder: item.favoriteOrder})
        .where(and(eq(videoSources.id, item.id), eq(videoSources.userId, user.id))),
    ),
  );

  return NextResponse.json({ok: true});
});
