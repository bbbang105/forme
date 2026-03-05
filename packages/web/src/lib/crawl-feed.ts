/**
 * Shared RSS crawl logic used by both the SSE crawl endpoint and the Vercel Cron job.
 */
import {and, eq} from 'drizzle-orm';
import {parseFeed} from 'feedsmith';
import {curationItems, curationSources, db} from '@forme/shared';
import {isSafeUrl} from './url-safety';

export interface CrawlSourceResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  itemsFound: number;
  newItemsAdded: number;
  itemsFilteredOut: number;
  error?: string;
}

interface CrawlOptions {
  since?: Date;
}

interface NormalizedFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  categories?: string[];
}

/**
 * Normalize feed items across different formats (RSS/Atom/JSON/RDF)
 */
function extractFeedItems(result: ReturnType<typeof parseFeed>): NormalizedFeedItem[] {
  const { format, feed } = result;

  if (format === 'atom') {
    return (feed.entries ?? []).map((entry) => ({
      title: entry.title,
      link: entry.links?.[0]?.href,
      pubDate: entry.published ?? entry.updated,
      description: entry.summary ?? entry.content,
      categories: entry.categories?.map((c) => c.term).filter(Boolean) as string[],
    }));
  }

  if (format === 'rss') {
    return (feed.items ?? []).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate ? String(item.pubDate) : undefined,
      description: item.description,
      categories: item.categories
        ?.map((c) => (typeof c === 'string' ? c : c.name))
        .filter(Boolean) as string[],
    }));
  }

  if (format === 'json') {
    return (feed.items ?? []).map((item) => ({
      title: item.title,
      link: item.url ?? item.external_url,
      pubDate: item.date_published ?? item.date_modified,
      description: item.summary ?? item.content_text,
      categories: item.tags,
    }));
  }

  // RDF
  return (feed.items ?? []).map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: item.dc?.date,
    description: item.description,
  }));
}

/**
 * Strip HTML tags and entities, truncate to 300 chars
 */
function sanitizeDescription(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > 300 ? text.slice(0, 300) + '...' : text;
}

/**
 * Sanitize title by stripping HTML tags
 */
function sanitizeTitle(title: string): string {
  return title
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Fetch og:image meta tag from a URL (5s timeout) with SSRF protection
 */
async function extractOgImage(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FormeBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

interface CrawlSource {
  id: string;
  name: string;
  rssUrl: string;
  category: string;
  tags?: string[];
}

/**
 * Crawl a single RSS source: fetch feed, parse items, batch insert new items.
 * Uses INSERT ON CONFLICT DO NOTHING to avoid N+1 queries.
 */
export async function crawlSource(source: CrawlSource, options?: CrawlOptions): Promise<CrawlSourceResult> {
  try {
    if (!isSafeUrl(source.rssUrl)) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        success: false,
        itemsFound: 0,
        newItemsAdded: 0,
        itemsFilteredOut: 0,
        error: 'URL not allowed (private/loopback)',
      };
    }

    const response = await fetch(source.rssUrl, {
      headers: { 'User-Agent': 'FormeBot/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        success: false,
        itemsFound: 0,
        newItemsAdded: 0,
        itemsFilteredOut: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const xml = await response.text();
    const parsed = parseFeed(xml);
    const feedItems = extractFeedItems(parsed);

    // Prepare items for batch insert
    let validItems = feedItems.filter((item) => item.link && item.title);

    // Filter by since date if provided
    let itemsFilteredOut = 0;
    if (options?.since) {
      const sinceTime = options.since.getTime();
      const beforeCount = validItems.length;
      validItems = validItems.filter((item) => {
        if (!item.pubDate) return true; // keep items without date
        const itemDate = new Date(item.pubDate);
        if (isNaN(itemDate.getTime())) return true; // keep unparseable dates
        return itemDate.getTime() >= sinceTime;
      });
      itemsFilteredOut = beforeCount - validItems.length;
    }

    if (validItems.length === 0) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        success: true,
        itemsFound: feedItems.length,
        newItemsAdded: 0,
        itemsFilteredOut,
      };
    }

    // Fetch OG images in parallel (concurrency cap of 5)
    const OG_CONCURRENCY = 5;
    const ogImages: (string | null)[] = new Array(validItems.length).fill(null);

    for (let i = 0; i < validItems.length; i += OG_CONCURRENCY) {
      const batch = validItems.slice(i, i + OG_CONCURRENCY);
      const results = await Promise.all(
        batch.map((item) => extractOgImage(item.link!))
      );
      for (let j = 0; j < results.length; j++) {
        ogImages[i + j] = results[j];
      }
    }

    // Build insert values
    const insertValues = validItems.map((item, idx) => {
      let publishedAt: Date | null = null;
      if (item.pubDate) {
        const parsedDate = new Date(item.pubDate);
        if (!isNaN(parsedDate.getTime())) publishedAt = parsedDate;
      }

      // Merge feed categories + source tags (deduplicated, sanitized)
      const MAX_TAG_LENGTH = 100;
      const normalizeTag = (t: string) => t.trim().slice(0, MAX_TAG_LENGTH);
      const feedCats = (item.categories ?? []).map(normalizeTag).filter(Boolean);
      const sourceTags = (source.tags ?? []).map(normalizeTag).filter(Boolean);
      const mergedTags = [...new Set([...feedCats, ...sourceTags])];

      return {
        sourceId: source.id,
        title: sanitizeTitle(item.title!),
        url: item.link!,
        description: sanitizeDescription(item.description),
        thumbnailUrl: ogImages[idx] ?? null,
        publishedAt,
        category: source.category,
        tags: mergedTags.length > 0 ? mergedTags : null,
      };
    });

    // Batch insert with conflict handling (unique on source_id + url)
    const inserted = await db
      .insert(curationItems)
      .values(insertValues)
      .onConflictDoNothing()
      .returning({ id: curationItems.id });

    return {
      sourceId: source.id,
      sourceName: source.name,
      success: true,
      itemsFound: feedItems.length,
      newItemsAdded: inserted.length,
      itemsFilteredOut,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      success: false,
      itemsFound: 0,
      newItemsAdded: 0,
      itemsFilteredOut: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get active sources with RSS URLs for a given user
 */
export async function getActiveSourcesForUser(userId: string) {
  const allSources = await db
    .select()
    .from(curationSources)
    .where(and(eq(curationSources.userId, userId), eq(curationSources.isActive, true)))
    .limit(50);

  return allSources
    .filter((s) => s.rssUrl)
    .map((s) => ({
      id: s.id,
      name: s.name,
      rssUrl: s.rssUrl!,
      category: s.category,
      tags: s.tags ?? undefined,
    }));
}
