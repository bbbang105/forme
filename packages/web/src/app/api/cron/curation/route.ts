import {NextResponse} from 'next/server';
import {crawlSource, type CrawlSourceResult, getActiveSourcesForUser} from '@/lib/crawl-feed';
import {sendPushToUser} from '@/lib/push';
import {sendDiscordEmbed} from '@/lib/discord';
import {withTracing} from '@/lib/logger';
import {getAllUserIds, verifyCronSecret} from '@/lib/cron-auth';
import {curationItems, curationSources, db} from '@forme/shared';
import {and, desc, eq, gte} from 'drizzle-orm';

export const maxDuration = 300;

/**
 * GET /api/cron/curation
 * Vercel Cron: 매일 모든 유저의 활성 RSS 소스를 크롤링.
 */
export const GET = withTracing('GET /api/cron/curation', async (request) => {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userIds = await getAllUserIds();
  const startedAt = Date.now();
  const since = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  let globalTotalNew = 0;

  for (const userId of userIds) {
    const sources = await getActiveSourcesForUser(userId);
    if (sources.length === 0) continue;

    const settled = await Promise.allSettled(
      sources.map((source) => crawlSource(source, { since })),
    );
    const results: CrawlSourceResult[] = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            sourceId: sources[i]!.id,
            sourceName: sources[i]!.name,
            success: false,
            itemsFound: 0,
            newItemsAdded: 0,
            itemsFilteredOut: 0,
            error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
          },
    );

    const totalNewItems = results.reduce((sum, r) => sum + r.newItemsAdded, 0);
    globalTotalNew += totalNewItems;

    const summary = {
      userId,
      totalSources: sources.length,
      totalNewItems,
      successCount: results.filter((r) => r.success).length,
      failCount: results.filter((r) => !r.success).length,
    };

    console.info('[cron/curation] user complete', summary);

    if (totalNewItems > 0) {
      const greetings = [
        '☕ 좋은 아침이에요!',
        '🌅 오늘도 좋은 하루 되세요!',
        '📬 새로운 소식이 도착했어요!',
        '✨ 오늘의 큐레이션이 준비됐어요!',
      ];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)]!;

      try {
        await sendPushToUser(userId, {
          title: `${greeting} +${totalNewItems}개 새 글`,
          body: `📰 ${summary.totalSources}개 소스에서 ${totalNewItems}개를 찾았어요!`,
          tag: 'curation-crawl',
          url: '/curation',
        });
      } catch (err) {
        console.error('[cron/curation] push failed', userId, err);
      }
    }

    // NotebookLM용 URL 목록 Discord 전송 (첫 번째 유저만 — 개인 Discord 웹훅)
    if (totalNewItems > 0) {
      try {
        const recentItems = await db
          .select({
            title: curationItems.title,
            url: curationItems.url,
            category: curationItems.category,
          })
          .from(curationItems)
          .innerJoin(
            curationSources,
            eq(curationItems.sourceId, curationSources.id),
          )
          .where(
            and(
              eq(curationSources.userId, userId),
              gte(curationItems.collectedAt, since),
            ),
          )
          .orderBy(desc(curationItems.collectedAt))
          .limit(20);

        const urlList = recentItems
          .map((item) => `- [${item.category}] ${item.title}\n  ${item.url}`)
          .join('\n');

        const countNote = totalNewItems > recentItems.length
          ? ` (최근 ${recentItems.length}개 / 전체 ${totalNewItems}개)`
          : '';

        await sendDiscordEmbed(
          `NotebookLM 팟캐스트 소스 (${totalNewItems}개)`,
          `아래 URL을 NotebookLM에 붙여넣으세요${countNote}:\n\n${urlList}`,
        );
      } catch (err) {
        console.error('[cron/curation] discord failed', userId, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    userCount: userIds.length,
    totalNewItems: globalTotalNew,
    durationMs: Date.now() - startedAt,
  });
});
