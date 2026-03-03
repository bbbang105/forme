import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationSources, db} from '@forme/shared';
import {and, eq} from 'drizzle-orm';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { items?: { id: string; favoriteOrder: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: 'items must be a non-empty array' },
      { status: 400 }
    );
  }

  if (body.items.length > 50) {
    return NextResponse.json(
      { error: 'Too many items (max 50)' },
      { status: 400 }
    );
  }

  const ids = new Set<string>();
  for (const item of body.items) {
    if (!UUID_REGEX.test(item.id)) {
      return NextResponse.json(
        { error: 'items contains an invalid id format' },
        { status: 400 }
      );
    }
    if (ids.has(item.id)) {
      return NextResponse.json(
        { error: 'Duplicate ids are not allowed' },
        { status: 400 }
      );
    }
    ids.add(item.id);
    if (
      typeof item.favoriteOrder !== 'number' ||
      !Number.isInteger(item.favoriteOrder) ||
      item.favoriteOrder < 0 ||
      item.favoriteOrder > 10_000
    ) {
      return NextResponse.json(
        { error: 'favoriteOrder must be an integer between 0 and 10000' },
        { status: 400 }
      );
    }
  }

  const items = body.items;

  try {
    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(curationSources)
          .set({ favoriteOrder: item.favoriteOrder })
          .where(
            and(
              eq(curationSources.id, item.id),
              eq(curationSources.userId, user.id)
            )
          );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/curation/sources/reorder]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
