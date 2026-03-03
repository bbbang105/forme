import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, curationSources } from '@forme/shared';
import { eq, and } from 'drizzle-orm';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth first
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }

  let body: { name?: string; category?: string; isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Partial<{
    name: string;
    category: string;
    isActive: boolean;
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
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth first
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
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
}
