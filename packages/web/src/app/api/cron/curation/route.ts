import { NextRequest, NextResponse } from 'next/server';
import { crawlSource, getActiveSourcesForUser, type CrawlSourceResult } from '@/lib/crawl-feed';

/**
 * GET /api/cron/curation
 * Vercel Cron job: runs daily to crawl all active RSS sources for the app user.
 * Requires Authorization: Bearer <CRON_SECRET> header (set by Vercel automatically).
 * Requires CRON_USER_ID env var to identify the single app user.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.CRON_USER_ID;
  if (!userId) {
    console.error('[cron/curation] CRON_USER_ID env var is not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const startedAt = Date.now();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sources = await getActiveSourcesForUser(userId);

  if (sources.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { totalSources: 0, totalNewItems: 0, successCount: 0, failCount: 0 },
      durationMs: Date.now() - startedAt,
    });
  }

  const results: CrawlSourceResult[] = [];

  for (const source of sources) {
    const result = await crawlSource(source, { since });
    results.push(result);
  }

  const totalNewItems = results.reduce((sum, r) => sum + r.newItemsAdded, 0);
  const summary = {
    totalSources: sources.length,
    totalNewItems,
    successCount: results.filter((r) => r.success).length,
    failCount: results.filter((r) => !r.success).length,
  };

  console.info('[cron/curation] complete', summary);

  return NextResponse.json({
    ok: true,
    results,
    summary,
    durationMs: Date.now() - startedAt,
  });
}
