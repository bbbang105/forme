'use client';

import {memo, useMemo, useState} from 'react';
import Image from 'next/image';
import {Bookmark} from 'lucide-react';
import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle,} from '@/lib/curation-utils';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isNew(collectedAt: string): boolean {
  return Date.now() - new Date(collectedAt).getTime() < ONE_DAY_MS;
}

export interface CurationItemData {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  category: string;
  tags: string[] | null;
  isRead: boolean;
  isBookmarked: boolean;
  collectedAt: string;
  sourceName: string | null;
}

interface CurationCardProps {
  item: CurationItemData;
  onToggleBookmark: (id: string, isBookmarked: boolean) => void;
  onMarkRead: (id: string) => void;
}

function Thumbnail({
  src,
  title,
  className = '',
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(() => getArticleGradient(title), [title]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'bg-gradient-to-br flex items-center justify-center',
          gradient,
          className
        )}
      >
        <span className="text-2xl select-none opacity-60">📄</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={480}
      height={270}
      unoptimized
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}

export const CurationCard = memo(function CurationCard({
  item,
  onToggleBookmark,
  onMarkRead,
}: CurationCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);

  const handleClick = () => {
    if (!item.isRead) {
      onMarkRead(item.id);
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark(item.id, !item.isBookmarked);
  };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        'group flex flex-col rounded-xl border border-border/60 bg-card',
        'hover:border-primary/30 hover:shadow-md transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
        <Thumbnail
          src={item.thumbnailUrl}
          title={item.title}
          className="w-full h-full"
        />
        {isNew(item.collectedAt) && (
          <span className="absolute top-2 left-2 inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
            NEW
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 gap-2 p-3">
        {/* Category badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              catStyle.bg,
              catStyle.text,
              catStyle.ring
            )}
          >
            {catStyle.label}
          </span>
          {item.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary/10 ring-1 ring-inset ring-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h3>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {item.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            {item.sourceName && (
              <span className="truncate max-w-[120px]">{item.sourceName}</span>
            )}
            {item.sourceName && dateLabel && <span>·</span>}
            {dateLabel && <span className="shrink-0">{dateLabel}</span>}
          </div>
          <button
            onClick={handleBookmark}
            className={cn(
              'p-1.5 rounded-md transition-colors shrink-0',
              item.isBookmarked
                ? 'text-amber-500'
                : 'text-muted-foreground/40 hover:text-amber-500'
            )}
            aria-label={item.isBookmarked ? '북마크 해제' : '북마크'}
          >
            <Bookmark
              className="h-5 w-5"
              fill={item.isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
    </a>
  );
});

/** List row variant for desktop */
export const CurationListRow = memo(function CurationListRow({
  item,
  onToggleBookmark,
  onMarkRead,
}: CurationCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);

  const handleClick = () => {
    if (!item.isRead) {
      onMarkRead(item.id);
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark(item.id, !item.isBookmarked);
  };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        'group flex items-start gap-4 py-4 px-3 -mx-3 rounded-lg',
        'hover:bg-muted/40 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
      )}
    >
      {/* Small thumbnail */}
      <div className="w-[100px] h-[64px] shrink-0 rounded-md overflow-hidden bg-muted">
        <Thumbnail
          src={item.thumbnailUrl}
          title={item.title}
          className="w-full h-full"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-1.5">
        <div className="flex items-center gap-1.5">
          {isNew(item.collectedAt) && (
            <span className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shrink-0">
              NEW
            </span>
          )}
          <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              catStyle.bg,
              catStyle.text,
              catStyle.ring
            )}
          >
            {catStyle.label}
          </span>
          {item.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary/10 ring-1 ring-inset ring-primary/20"
            >
              {tag}
            </span>
          ))}
          {item.sourceName && (
            <span className="text-xs text-muted-foreground truncate">
              {item.sourceName}
            </span>
          )}
          {dateLabel && (
            <span className="text-xs text-muted-foreground">
              {dateLabel}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center shrink-0 pt-1">
        <button
          onClick={handleBookmark}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            item.isBookmarked
              ? 'text-amber-500'
              : 'text-muted-foreground/40 hover:text-amber-500'
          )}
          aria-label={item.isBookmarked ? '북마크 해제' : '북마크'}
        >
          <Bookmark
            className="h-4.5 w-4.5"
            fill={item.isBookmarked ? 'currentColor' : 'none'}
          />
        </button>
      </div>
    </a>
  );
});
