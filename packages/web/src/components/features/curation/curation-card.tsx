'use client';

import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Image from 'next/image';
import {Bookmark, Check, FileText, MessageSquare, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle,} from '@/lib/curation-utils';
import {Checkbox} from '@/components/ui/checkbox';
import {useSwipeAction} from '@/hooks/use-swipe-action';

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
  memo: string | null;
}

interface CurationCardProps {
  item: CurationItemData;
  onToggleBookmark: (id: string, isBookmarked: boolean) => void;
  onMarkRead: (id: string) => void;
  onDelete?: (id: string) => void;
  onMemoChange?: (id: string, memo: string | null) => void;
  showMemo?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  compact?: boolean;
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
        <FileText className="h-6 w-6 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={title}
      width={480}
      height={270}
      unoptimized
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}

function InlineMemo({
  itemId,
  initialMemo,
  onMemoChange,
}: {
  itemId: string;
  initialMemo: string | null;
  onMemoChange: (id: string, memo: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialMemo ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const save = useCallback(() => {
    if (savingRef.current) return;
    const trimmed = value.trim();
    const newMemo = trimmed || null;
    if (newMemo !== (initialMemo ?? null)) {
      savingRef.current = true;
      onMemoChange(itemId, newMemo);
      // Reset after microtask to prevent onBlur + button double-fire
      queueMicrotask(() => { savingRef.current = false; });
    }
    setEditing(false);
  }, [value, initialMemo, itemId, onMemoChange]);

  if (!editing && !initialMemo) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1"
      >
        <MessageSquare className="h-3 w-3" />
        <span>메모 추가</span>
      </button>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="w-full text-left mt-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/40 text-xs text-muted-foreground hover:border-border transition-colors"
      >
        <div className="flex items-start gap-1.5">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
          <span className="line-clamp-2 whitespace-pre-wrap">{initialMemo}</span>
        </div>
      </button>
    );
  }

  return (
    <div
      className="mt-1.5"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            setValue(initialMemo ?? '');
            setEditing(false);
          }
        }}
        maxLength={500}
        rows={2}
        placeholder="메모를 입력하세요..."
        className="w-full text-base sm:text-sm px-2.5 py-1.5 rounded-md bg-muted/50 border border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground/50">{value.length}/500</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setValue(initialMemo ?? '');
              setEditing(false);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
          >
            취소
          </button>
          <button
            onClick={save}
            className="text-[10px] text-primary font-medium hover:text-primary/80 px-1.5 py-0.5 rounded"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/** Swipe action background indicators */
function SwipeBackground({ direction }: { direction: 'left' | 'right' }) {
  if (direction === 'right') {
    return (
      <div className="absolute inset-0 rounded-xl bg-primary/15 flex items-center pl-5 pointer-events-none">
        <div className="flex items-center gap-1.5 text-primary">
          <Check className="h-5 w-5" />
          <span className="text-xs font-medium">읽음</span>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 rounded-xl bg-destructive/15 flex items-center justify-end pr-5 pointer-events-none">
      <div className="flex items-center gap-1.5 text-destructive">
        <span className="text-xs font-medium">삭제</span>
        <Trash2 className="h-5 w-5" />
      </div>
    </div>
  );
}

// ─── CurationCard (mobile/tablet grid) ───────────────────────────────────────

export const CurationCard = memo(function CurationCard({
  item,
  onToggleBookmark,
  onMarkRead,
  onDelete,
  onMemoChange,
  showMemo,
  selectMode,
  selected,
  onToggleSelect,
  compact,
}: CurationCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);

  const { containerRef, handlers } = useSwipeAction({
    onSwipeRight: () => {
      if (!item.isRead) onMarkRead(item.id);
    },
    onSwipeLeft: () => onDelete?.(item.id),
  });

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(item.id);
      return;
    }
    if (!item.isRead) {
      onMarkRead(item.id);
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark(item.id, !item.isBookmarked);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(item.id);
  };

  // Compact view: horizontal layout like list row
  if (compact) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <SwipeBackground direction="right" />
        <SwipeBackground direction="left" />
        <div ref={containerRef} {...(selectMode ? {} : handlers)}>
          <a
            href={selectMode ? undefined : item.url}
            target={selectMode ? undefined : '_blank'}
            rel={selectMode ? undefined : 'noopener noreferrer'}
            onClick={handleClick}
            className={cn(
              'group relative flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card',
              'hover:border-primary/30 hover:shadow-md transition-all duration-200',
              selectMode && 'cursor-pointer',
              selected && 'ring-2 ring-primary border-primary/40',
            )}
          >
            {selectMode && (
              <div className="flex items-center shrink-0">
                <div className="flex items-center justify-center min-h-[44px] min-w-[44px]">
                  <Checkbox checked={selected} onCheckedChange={() => onToggleSelect?.(item.id)} className="h-5 w-5 border-2" />
                </div>
              </div>
            )}
            <div className="w-[80px] h-[52px] shrink-0 rounded-md overflow-hidden bg-muted">
              <Thumbnail src={item.thumbnailUrl} title={item.title} className="w-full h-full" />
            </div>
            <div className="flex flex-col flex-1 min-w-0 gap-1">
              <div className="flex items-center gap-1.5">
                {isNew(item.collectedAt) && (
                  <span className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shrink-0">
                    NEW
                  </span>
                )}
                <h3 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset', catStyle.bg, catStyle.text, catStyle.ring)}>
                  {catStyle.label}
                </span>
                {item.sourceName && <span className="text-[10px] text-muted-foreground truncate">{item.sourceName}</span>}
                {dateLabel && <span className="text-[10px] text-muted-foreground">{dateLabel}</span>}
              </div>
            </div>
            {!selectMode && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={handleDelete} className="p-1 rounded-md transition-colors text-muted-foreground/40 hover:text-destructive" aria-label="삭제">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleBookmark}
                  className={cn('p-1 rounded-md transition-colors shrink-0', item.isBookmarked ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-amber-500')}
                  aria-label={item.isBookmarked ? '북마크 해제' : '북마크'}
                >
                  <Bookmark className="h-4 w-4" fill={item.isBookmarked ? 'currentColor' : 'none'} />
                </button>
              </div>
            )}
          </a>
        </div>
      </div>
    );
  }

  // Default card view
  return (
    <div className="relative overflow-hidden rounded-xl">
      <SwipeBackground direction="right" />
      <SwipeBackground direction="left" />
      <div ref={containerRef} {...(selectMode ? {} : handlers)}>
        <a
          href={selectMode ? undefined : item.url}
            target={selectMode ? undefined : '_blank'}
            rel={selectMode ? undefined : 'noopener noreferrer'}
          onClick={handleClick}
          className={cn(
            'group relative flex flex-col rounded-xl border border-border/60 bg-card',
            'hover:border-primary/30 hover:shadow-md transition-all duration-200',
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            selectMode && 'cursor-pointer',
            selected && 'ring-2 ring-primary border-primary/40',
          )}
        >
          {/* Select checkbox */}
          {selectMode && (
            <div className="absolute top-0 left-0 z-10 flex items-center justify-center min-h-[44px] min-w-[44px]">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect?.(item.id)}
                className="h-5 w-5 border-2 bg-background/80 backdrop-blur-sm"
              />
            </div>
          )}

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
              {!selectMode && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleDelete}
                    className="p-1.5 rounded-md transition-colors text-muted-foreground/40 hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
              )}
            </div>

            {/* Inline memo (bookmark tab only) */}
            {showMemo && !selectMode && onMemoChange && (
              <InlineMemo
                key={item.memo ?? ''}
                itemId={item.id}
                initialMemo={item.memo}
                onMemoChange={onMemoChange}
              />
            )}
          </div>
        </a>
      </div>
    </div>
  );
});

// ─── CurationListRow (desktop list) ──────────────────────────────────────────

export const CurationListRow = memo(function CurationListRow({
  item,
  onToggleBookmark,
  onMarkRead,
  onDelete,
  onMemoChange,
  showMemo,
  selectMode,
  selected,
  onToggleSelect,
}: CurationCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(item.id);
      return;
    }
    if (!item.isRead) {
      onMarkRead(item.id);
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark(item.id, !item.isBookmarked);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(item.id);
  };

  return (
    <a
      href={selectMode ? undefined : item.url}
      target={selectMode ? undefined : '_blank'}
      rel={selectMode ? undefined : 'noopener noreferrer'}
      onClick={handleClick}
      className={cn(
        'group flex items-start gap-4 py-4 px-3 -mx-3 rounded-lg',
        'hover:bg-muted/40 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selectMode && 'cursor-pointer',
        selected && 'bg-primary/5'
      )}
    >
      {/* Checkbox */}
      {selectMode && (
        <div className="flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect?.(item.id)}
            className="h-5 w-5 border-2"
          />
        </div>
      )}

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

        {/* Inline memo (bookmark tab only) */}
        {showMemo && !selectMode && onMemoChange && (
          <InlineMemo
            key={item.memo ?? ''}
            itemId={item.id}
            initialMemo={item.memo}
            onMemoChange={onMemoChange}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 pt-1">
        {!selectMode && (
          <>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md transition-colors text-muted-foreground/40 hover:text-destructive"
              aria-label="삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
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
                className="h-5 w-5"
                fill={item.isBookmarked ? 'currentColor' : 'none'}
              />
            </button>
          </>
        )}
      </div>
    </a>
  );
});
