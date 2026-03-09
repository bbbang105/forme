import {NextResponse} from 'next/server';
import {sendDiscordMessage} from '@/lib/discord';
import {withTracing} from '@/lib/logger';
import {verifyCronAuth} from '@/lib/cron-auth';

export const maxDuration = 30;

/**
 * GET /api/cron/podcast-reminder
 * Vercel Cron: 23:00 KST — 팟캐스트 만들 시간 리마인더.
 */
export const GET = withTracing('GET /api/cron/podcast-reminder', async (request) => {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await sendDiscordMessage(
    '🎙️ **팟캐스트 만들 시간!**\n\n'
    + '1. 위에 보낸 URL 목록을 NotebookLM에 붙여넣기\n'
    + '2. Audio Overview 생성\n'
    + '3. forme에 업로드\n\n'
    + '내일 출근길에 들을 팟캐스트를 준비하세요!',
  );

  return NextResponse.json({ ok: true });
});
