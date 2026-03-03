import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
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

  return NextResponse.json({
    id: user.id,
    email: user.email,
    discordId: discordIdentity?.id,
    discordUsername: discordIdentity?.identity_data?.full_name || discordIdentity?.identity_data?.name,
    avatarUrl: discordIdentity?.identity_data?.avatar_url,
  });
}
