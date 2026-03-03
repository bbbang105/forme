import { createClient } from '@/lib/supabase/server';
import { crawlSource, getActiveSourcesForUser, type CrawlSourceResult } from '@/lib/crawl-feed';

/**
 * POST /api/curation/crawl
 * Triggers RSS crawl for all active sources belonging to the authenticated user.
 * Streams progress via Server-Sent Events.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sources = await getActiveSourcesForUser(user.id);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      send('start', { totalSources: sources.length });

      if (sources.length === 0) {
        send('complete', {
          results: [],
          summary: { totalSources: 0, totalNewItems: 0, successCount: 0, failCount: 0 },
        });
        controller.close();
        return;
      }

      const results: CrawlSourceResult[] = [];

      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]!;

        send('processing', {
          index: i,
          sourceName: source.name,
          total: sources.length,
        });

        const result = await crawlSource(source);
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

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
