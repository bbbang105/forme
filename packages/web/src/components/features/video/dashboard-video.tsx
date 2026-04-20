import Link from 'next/link';
import {desc, eq, and} from 'drizzle-orm';
import {db, videoItems} from '@forme/shared';
import {getAuthUser} from '@/lib/auth';
import {PlayCircle} from 'lucide-react';

const LIMIT = 5;

export async function DashboardVideo() {
  try {
    const user = await getAuthUser();
    const items = await db
      .select({
        id: videoItems.id,
        title: videoItems.title,
        channelName: videoItems.channelName,
        thumbnailUrl: videoItems.thumbnailUrl,
      })
      .from(videoItems)
      .where(
        and(
          eq(videoItems.userId, user.id),
          eq(videoItems.status, 'summarized')
        )
      )
      .orderBy(desc(videoItems.summarizedAt))
      .limit(LIMIT);

    if (items.length === 0) {
      return (
        <section aria-labelledby="dashboard-video-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="dashboard-video-heading" className="text-sm font-semibold">
              최근 유튜브 요약
            </h3>
            <Link href="/video" className="text-xs text-muted-foreground hover:text-foreground">
              전체 보기
            </Link>
          </div>
          <p className="text-sm text-muted-foreground rounded-xl border border-border/60 p-6 text-center">
            아직 요약된 영상이 없습니다.
          </p>
        </section>
      );
    }

    return (
      <section aria-labelledby="dashboard-video-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="dashboard-video-heading" className="text-sm font-semibold">
            최근 유튜브 요약
          </h3>
          <Link href="/video" className="text-xs text-muted-foreground hover:text-foreground">
            전체 보기
          </Link>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/video/${item.id}`}
                className="flex gap-3 rounded-xl border border-border/60 p-3 hover:bg-accent/40 transition-colors"
              >
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="h-14 w-24 rounded-md object-cover bg-muted"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-14 w-24 rounded-md bg-muted flex items-center justify-center">
                    <PlayCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  {item.channelName && (
                    <p className="text-xs text-muted-foreground truncate">
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
  } catch {
    return (
      <section aria-labelledby="dashboard-video-heading-error" className="space-y-3">
        <h3 id="dashboard-video-heading-error" className="text-sm font-semibold">
          최근 유튜브 요약
        </h3>
        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 p-4">
          목록을 불러오지 못했습니다.
        </p>
      </section>
    );
  }
}
