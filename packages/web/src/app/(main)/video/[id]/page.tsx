import {notFound} from 'next/navigation';
import {and, eq} from 'drizzle-orm';
import {db, videoItems} from '@forme/shared';
import {getAuthUser} from '@/lib/auth';
import {UUID_REGEX} from '@/lib/validators';
import Link from 'next/link';
import Image from 'next/image';
import {ArrowLeft, ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatRelativeDate} from '@/lib/curation-utils';
import {MarkdownRendererLazy} from '@/components/features/video/markdown-renderer-lazy';

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const user = await getAuthUser();

  const [item] = await db
    .select()
    .from(videoItems)
    .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)));

  if (!item || item.status !== 'summarized') notFound();

  const dateLabel = item.publishedAt
    ? formatRelativeDate(item.publishedAt.toISOString())
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      {/* Back link */}
      <Link
        href="/video"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        돌아가기
      </Link>

      {/* Thumbnail */}
      {item.thumbnailUrl && (
        <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-muted">
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
            priority
            unoptimized
          />
        </div>
      )}

      {/* Title */}
      <h1 className="text-xl font-bold leading-tight">{item.title}</h1>

      {/* Metadata */}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{item.channelName}</span>
        {dateLabel && (
          <>
            <span className="text-border">·</span>
            <span>{dateLabel}</span>
          </>
        )}
        {item.summarySource === 'description' && (
          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
            설명 기반
          </span>
        )}
      </p>

      {/* Keywords */}
      {item.keywords && item.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* One-liner summary */}
      {item.oneLiner && (
        <blockquote className="mt-4 border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground italic">
          {item.oneLiner}
        </blockquote>
      )}

      {/* Markdown summary */}
      <div className="mt-6">
        {item.summary && <MarkdownRendererLazy content={item.summary} />}
      </div>

      {/* YouTube original link */}
      <div className="mt-8">
        <Button asChild variant="outline" className="w-full gap-2">
          <a
            href={`https://www.youtube.com/watch?v=${item.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            YouTube에서 보기
          </a>
        </Button>
      </div>
    </div>
  );
}
