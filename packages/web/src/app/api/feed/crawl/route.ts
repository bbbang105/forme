import {createClient} from '@/lib/supabase/server';
import {crawlSource, type CrawlSourceResult, getActiveSourcesForUser} from '@/lib/crawl-feed';
import {withTracing} from '@/lib/logger';
import {createSseStream} from '@/lib/sse';

/**
 * POST /api/feed/crawl
 * Triggers RSS crawl for all active sources belonging to the authenticated user.
 * Streams progress via Server-Sent Events.
 */
export const POST = withTracing('POST /api/feed/crawl', async (request: Request) => {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse optional since date from request body
  // Accept only dates within the last year and not in the future.
  let since: Date | undefined;
  try {
    const body = await request.json();
    if (body.since) {
      const parsed = new Date(body.since);
      const now = Date.now();
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      if (
        !isNaN(parsed.getTime()) &&
        parsed.getTime() >= oneYearAgo &&
        parsed.getTime() <= now
      ) {
        since = parsed;
      }
    }
  } catch {
    // No body or invalid JSON — continue without since filter
  }

  const sources = await getActiveSourcesForUser(user.id);

  return createSseStream(async (send, close, signal) => {
    send('start', { totalSources: sources.length });

    if (sources.length === 0) {
      send('complete', {
        results: [],
        summary: { totalSources: 0, totalNewItems: 0, successCount: 0, failCount: 0 },
      });
      close();
      return;
    }

    const results: CrawlSourceResult[] = [];

    for (let i = 0; i < sources.length; i++) {
      if (signal.aborted) break;
      const source = sources[i]!;

      send('processing', {
        index: i,
        sourceName: source.name,
        total: sources.length,
      });

      const result = await crawlSource(source, since ? { since } : undefined);
      results.push(result);
      send('progress', { index: i, result });
    }

    const totalNewItems = results.reduce((sum, r) => sum + r.newItemsAdded, 0);

    send('complete', {
      results,
      summary: {
        totalSources: sources.length,
        totalNewItems,
        successCount: results.filter((r) => r.success).length,
        failCount: results.filter((r) => !r.success).length,
      },
    });

    close();
  });
});
