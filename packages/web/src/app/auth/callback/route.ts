import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_PATHS = ['/dashboard', '/feed', '/youtube', '/calendar', '/notes'];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/dashboard';

  // open redirect 방어: 상대경로 + 허용된 경로만 허용
  const safePath = rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/dashboard';
  const next = ALLOWED_PATHS.some((p) => safePath.startsWith(p))
    ? safePath
    : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession 실패:', error.message);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
