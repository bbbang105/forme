import {notFound} from 'next/navigation';
import {and, eq} from 'drizzle-orm';
import {db, youtubeItems} from '@forme/shared';
import {getAuthUser} from '@/lib/auth';
import {UUID_REGEX} from '@/lib/validators';
import Link from 'next/link';
import Image from 'next/image';
import {ArrowLeft, ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatRelativeDate} from '@/lib/feed-utils';
import {MarkdownRendererLazy} from '@/components/features/youtube/markdown-renderer-lazy';

export default async function YoutubeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const user = await getAuthUser();

  const [item] = await db
    .select()
    .from(youtubeItems)
    .where(and(eq(youtubeItems.id, id), eq(youtubeItems.userId, user.id)));

  if (!item || item.status !== 'summarized') notFound();

  const dateLabel = item.publishedAt
    ? formatRelativeDate(item.publishedAt.toISOString())
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      {/* Back link — mono */}
      <Link
        href="/youtube"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        back
      </Link>

      {/* Metadata eyebrow (channel + date + source marker) */}
      <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>{item.channelName}</span>
        {dateLabel && (
          <>
            <span aria-hidden="true">—</span>
            <span>{dateLabel}</span>
          </>
        )}
        {item.summarySource === 'description' && (
          <>
            <span aria-hidden="true">—</span>
            <span>desc-based</span>
          </>
        )}
      </p>

      {/* Title — editorial serif italic */}
      <h1 className="font-display text-3xl leading-[1.15] tracking-tight text-balance">
        {item.title}
      </h1>

      {/* One-liner summary — pull quote */}
      {item.oneLiner && (
        <blockquote className="mt-4 border-l-2 border-primary pl-4 font-display text-lg leading-snug text-foreground/80">
          {item.oneLiner}
        </blockquote>
      )}

      {/* Thumbnail */}
      {item.thumbnailUrl && (
        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-sm border border-border bg-muted">
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

      {/* Keywords — editorial chip row */}
      {item.keywords && item.keywords.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-4 border-b border-border">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">— keywords</span>
          {item.keywords.map((kw) => (
            <span
              key={kw}
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground/80"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Markdown summary */}
      <div className="mt-6">
        {item.summary && <MarkdownRendererLazy content={item.summary} />}
      </div>

      {/* YouTube original link */}
      <div className="mt-10 pt-6 border-t border-border">
        <Button
          asChild
          variant="outline"
          className="w-full gap-2 font-mono text-[11px] uppercase tracking-[0.12em] h-11"
        >
          <a
            href={`https://www.youtube.com/watch?v=${item.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            watch on youtube
          </a>
        </Button>
      </div>
    </div>
  );
}
