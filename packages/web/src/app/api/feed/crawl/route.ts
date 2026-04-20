import {createClient} from '@/lib/supabase/server';
import {crawlSource, type CrawlSourceResult, getActiveSourcesForUser} from '@/lib/crawl-feed';
import {withTracing} from '@/lib/logger';

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
  let since: Date | undefined;
  try {
    const body = await request.json();
    if (body.since) {
      const parsed = new Date(body.since);
      if (!isNaN(parsed.getTime())) since = parsed;
    }
  } catch {
    // No body or invalid JSON — continue without since filter
  }

  const sources = await getActiveSourcesForUser(user.id);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }

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
        if (closed) break;
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
    },
    cancel() {
      // Client disconnected — expected for SSE, suppress ECONNRESET
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
