import Link from 'next/link';
import {desc, eq, and} from 'drizzle-orm';
import {db, videoItems} from '@forme/shared';
import {getAuthUser} from '@/lib/auth';
import {PlayCircle} from 'lucide-react';
import {SectionHeader} from '@/components/ui/section-header';

const LIMIT = 5;

export async function DashboardVideo() {
  const user = await getAuthUser();
  const items = await db
    .select({
      id: videoItems.id,
      title: videoItems.title,
      channelName: videoItems.channelName,
      thumbnailUrl: videoItems.thumbnailUrl,
    })
    .from(videoItems)
    .where(and(eq(videoItems.userId, user.id), eq(videoItems.status, 'summarized')))
    .orderBy(desc(videoItems.summarizedAt))
    .limit(LIMIT);

  if (items.length === 0) {
    return (
      <section aria-labelledby="dashboard-video-heading" className="space-y-4">
        <SectionHeader
          eyebrow="YouTube"
          title="최근 요약"
          actionHref="/video"
          actionLabel="View all"
        />
        <p className="text-sm text-muted-foreground border-t border-border/60 py-8 text-center">
          아직 요약된 영상이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-video-heading" className="space-y-4">
      <SectionHeader
        eyebrow="YouTube"
        title="최근 요약"
        actionHref="/video"
        actionLabel="View all"
      />
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/video/${item.id}`}
              className="group flex gap-3 py-3 border-b border-border/60 last:border-b-0 transition-colors"
            >
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="h-14 w-24 rounded-sm object-cover bg-muted shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-14 w-24 rounded-sm bg-muted flex items-center justify-center shrink-0">
                  <PlayCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-display text-base leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                {item.channelName && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground truncate">
                    {item.channelName}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
