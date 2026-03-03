import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sendPushToUser} from '@/lib/push';

/**
 * POST /api/push/test — 테스트 푸시 알림 발송
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: 'forme 테스트 알림',
      body: '푸시 알림이 정상적으로 작동합니다!',
      tag: 'test',
      url: '/dashboard',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/push/test]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
