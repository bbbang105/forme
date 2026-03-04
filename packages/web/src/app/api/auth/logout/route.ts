import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';

export const POST = withTracing('POST /api/auth/logout', async (request) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[logout] signOut failed:', error.message);
  }

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
});
