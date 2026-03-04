import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {withTracing} from '@/lib/logger';

export const GET = withTracing('GET /api/auth/me', async () => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord'
  );

  return NextResponse.json(
    {
      id: user.id,
      email: user.email ?? null,
      discordId: discordIdentity?.identity_data?.provider_id ?? discordIdentity?.identity_data?.sub,
      discordUsername: discordIdentity?.identity_data?.full_name || discordIdentity?.identity_data?.name,
      avatarUrl: discordIdentity?.identity_data?.avatar_url,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
});
