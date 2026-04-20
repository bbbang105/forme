import Link from 'next/link';
import {ArrowRight, ExternalLink} from 'lucide-react';
import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle,} from '@/lib/feed-utils';
import {getAuthUser} from '@/lib/auth';
import {feedItems, feedSources, db} from '@forme/shared';
import {and, desc, eq, isNull, sql} from 'drizzle-orm';
import {MiniCardLink} from './mini-card-link';
import {MiniCardThumbnail} from './mini-card-thumbnail';

/**
 * Server-side shape mirroring the serialized API response used by
 * MiniCard. Dates are pre-formatted strings for display.
 */
interface MiniCardItem {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  category: string;
  sourceName: string | null;
}

/**
 * DashboardFeed — async server component.
 *
 * Fetches the 3 most recent unread feed items directly via Drizzle ORM,
 * bypassing the HTTP round-trip that the previous 'use client' version made
 * to /api/feed. Rendering happens server-side: zero client JS, no
 * loading state, no layout shift from a useEffect fetch, and the data is
 * available the moment the Suspense boundary resolves.
 *
 * The only interactive sub-component is MiniCardThumbnail (image error
 * fallback), which is a small 'use client' island. Everything else is plain
 * server-rendered HTML.
 */
export async function DashboardFeed() {
  const user = await getAuthUser();

  // Replicate the /api/feed?status=unread&limit=3 query used previously.
  // COALESCE(publishedAt, collectedAt) matches the sort date expression in the
  // full feed API route so results stay consistent.
  const sortDateExpr = sql`COALESCE(${feedItems.publishedAt}, ${feedItems.collectedAt})`;

  const rows = await db
    .select({
      id: feedItems.id,
      title: feedItems.title,
      url: feedItems.url,
      thumbnailUrl: feedItems.thumbnailUrl,
      publishedAt: feedItems.publishedAt,
      category: feedItems.category,
      sourceName: feedSources.name,
    })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(
      and(
        eq(feedSources.userId, user.id),
        eq(feedItems.isRead, false),
        isNull(feedItems.deletedAt),
      )
    )
    .orderBy(sql`${sortDateExpr} DESC`, desc(feedItems.id))
    .limit(3);

  if (rows.length === 0) return null;

  const items: MiniCardItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl ?? null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    category: row.category,
    sourceName: row.sourceName ?? null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">최신 큐레이션</h3>
        <Link
          href="/feed"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          더보기
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <MiniCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/** Server-rendered mini card — no client state except the thumbnail island. */
function MiniCard({ item }: { item: MiniCardItem }) {
  const catStyle = getCategoryStyle(item.category);
  const relativeDate = formatRelativeDate(item.publishedAt);
  const gradient = getArticleGradient(item.title);

  return (
    <MiniCardLink
      itemId={item.id}
      href={item.url}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border border-border/60',
        'hover:border-primary/30 hover:shadow-sm transition-all',
      )}
    >
      {/* Thumbnail — client island handles img error fallback */}
      <div className="w-16 h-12 rounded-md overflow-hidden bg-muted shrink-0">
        <MiniCardThumbnail
          src={item.thumbnailUrl}
          gradient={gradient}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              catStyle.bg,
              catStyle.text,
              catStyle.ring
            )}
          >
            {catStyle.label}
          </span>
          {item.sourceName && (
            <span className="text-xs text-muted-foreground truncate">
              {item.sourceName}
            </span>
          )}
          {relativeDate && (
            <span className="text-xs text-muted-foreground">{relativeDate}</span>
          )}
        </div>
      </div>

      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
    </MiniCardLink>
  );
}
