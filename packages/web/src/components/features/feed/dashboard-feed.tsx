import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle} from '@/lib/feed-utils';
import {getAuthUser} from '@/lib/auth';
import {feedItems, feedSources, db} from '@forme/shared';
import {and, desc, eq, isNull, sql} from 'drizzle-orm';
import {SectionHeader} from '@/components/ui/section-header';
import {MiniCardLink} from './mini-card-link';
import {MiniCardThumbnail} from './mini-card-thumbnail';
import {FeedHeroRotator, type HeroItem} from './dashboard-feed-hero';

const FETCH_LIMIT = 12;
const HERO_COUNT = 4;

/**
 * DashboardFeed — feed-first magazine layout.
 *
 * 최상단 히어로 로테이터(4편 자동 전환) + 하단 그리드(최대 8편 카드).
 * Unread 피드를 최대 12건 받아 4/8로 분할한다. 소량일 때는 갖고 있는 만큼만 렌더.
 */
export async function DashboardFeed() {
  const user = await getAuthUser();

  // COALESCE(publishedAt, collectedAt)로 RSS가 날짜 없을 때도 정렬 안정화.
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
      description: feedItems.description,
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
    .limit(FETCH_LIMIT);

  if (rows.length === 0) return null;

  const items: HeroItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl ?? null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    category: row.category,
    sourceName: row.sourceName ?? null,
    description: row.description ?? null,
  }));

  const heroItems = items.slice(0, HERO_COUNT);
  const gridItems = items.slice(HERO_COUNT);

  return (
    <section className="space-y-8">
      <SectionHeader
        eyebrow="Feed"
        title="오늘의 읽을거리"
        actionHref="/feed"
        actionLabel="View all"
      />

      {heroItems.length > 0 && (
        <div className="pb-8 border-b border-border">
          <FeedHeroRotator items={heroItems} />
        </div>
      )}

      {gridItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
          {gridItems.map((item) => (
            <FeedGridCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 히어로 밑 8개 카드 그리드의 단일 카드. 썸네일 위, 메타 + 제목 아래. */
function FeedGridCard({item}: {item: HeroItem}) {
  const catStyle = getCategoryStyle(item.category);
  const relativeDate = formatRelativeDate(item.publishedAt);
  const gradient = getArticleGradient(item.title);

  return (
    <MiniCardLink
      itemId={item.id}
      href={item.url}
      className="group flex flex-col gap-3"
    >
      <div className="aspect-[16/10] overflow-hidden rounded-sm bg-muted">
        <MiniCardThumbnail src={item.thumbnailUrl} gradient={gradient} />
      </div>
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground min-w-0">
          <span
            className={cn(
              'inline-flex rounded-sm px-1.5 py-0.5 ring-1 ring-inset normal-case tracking-normal shrink-0',
              catStyle.bg,
              catStyle.text,
              catStyle.ring,
            )}
          >
            {catStyle.label}
          </span>
          {item.sourceName && <span className="truncate">{item.sourceName}</span>}
          {relativeDate && (
            <>
              <span className="text-primary shrink-0" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0">{relativeDate}</span>
            </>
          )}
        </div>
        <h4 className="font-display text-lg leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
      </div>
    </MiniCardLink>
  );
}
