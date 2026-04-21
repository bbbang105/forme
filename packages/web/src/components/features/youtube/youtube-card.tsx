'use client';

import {memo, useCallback, useEffect, useRef, useState} from 'react';
import Image from 'next/image';
import {Bookmark, BookmarkCheck, FileText, MessageSquare, Pin, PinOff, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {ITEM_NOTE_MAX_LENGTH} from '@/lib/constants';
import {formatRelativeDate, getArticleGradient} from '@/lib/feed-utils';
import type {SavedItemBase} from '@/lib/types/saved-item';

export interface YoutubeItemData extends SavedItemBase {
  videoId: string;
  status: string;
  channelName: string;
  oneLiner: string | null;
  summarySource: string | null;
  keywords: string[] | null;
  duration: number | null;
}

interface YoutubeCardProps {
  item: YoutubeItemData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onClick?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleBookmark?: (id: string) => void;
  onMemoChange?: (id: string, note: string | null) => void;
  /** Toggle pin. When omitted the pin button isn't rendered. */
  onTogglePin?: (id: string, pinned: boolean) => void;
  /** True when a new pin is blocked (3 already pinned). No effect on already-pinned items. */
  pinLocked?: boolean;
  /** Render the saved-view variant: ember border + `pinned` label when pinned. */
  savedVariant?: boolean;
  showMemo?: boolean;
  sourceTags?: string[];
}

const TAG_COLORS: Record<string, string> = {
  economy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  dev: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ai: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  uxui: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  'start-up': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const TAG_LABELS: Record<string, string> = {
  economy: 'ECONOMY',
  dev: 'DEV',
  ai: 'AI',
  uxui: 'UX/UI',
  'start-up': 'START-UP',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function YoutubeThumbnail({
  src,
  title,
  duration,
}: {
  src: string | null;
  title: string;
  duration: number | null;
}) {
  const [failed, setFailed] = useState(false);
  const gradient = getArticleGradient(title);

  return (
    <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
      {(!src || failed) ? (
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-br flex items-center justify-center',
            gradient,
          )}
        >
          <FileText className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
        </div>
      ) : (
        <Image
          src={src}
          alt=""
          fill
          className="object-cover"
          sizes="144px"
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
      {duration != null && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white tabular-nums">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function InlineNote({
  itemId,
  initialMemo,
  onMemoChange,
}: {
  itemId: string;
  initialMemo: string | null;
  onMemoChange: (id: string, note: string | null) => void;
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
      queueMicrotask(() => { savingRef.current = false; });
    }
    setEditing(false);
  }, [value, initialMemo, itemId, onMemoChange]);

  if (!editing && !initialMemo) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1"
      >
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        <span>노트 추가</span>
      </button>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="w-full text-left mt-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/40 text-xs text-muted-foreground hover:border-border transition-colors"
      >
        <div className="flex items-start gap-1.5">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          <span className="whitespace-pre-wrap">{initialMemo}</span>
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
        maxLength={ITEM_NOTE_MAX_LENGTH}
        rows={2}
        placeholder="노트를 입력하세요…"
        aria-label="노트 입력"
        className="w-full text-base sm:text-sm px-2.5 py-1.5 rounded-md bg-muted/50 border border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground/50">{value.length}/{ITEM_NOTE_MAX_LENGTH}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              setValue(initialMemo ?? '');
              setEditing(false);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
          >
            취소
          </button>
          <button
            type="button"
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

export const YoutubeCard = memo(function YoutubeCard({
  item,
  selected,
  onSelect,
  onClick,
  onDelete,
  onToggleBookmark,
  onMemoChange,
  onTogglePin,
  pinLocked,
  savedVariant,
  showMemo,
  sourceTags = [],
}: YoutubeCardProps) {
  const isSummarized = item.status === 'summarized';
  const isSummarizing = item.status === 'summarizing';
  const dateLabel = formatRelativeDate(item.publishedAt);
  const isPinned = Boolean(item.pinnedAt);
  const pinDisabled = !isPinned && Boolean(pinLocked);

  const cardContent = (
    <>
      {/* Checkbox (select mode) */}
      {onSelect && (
        <div className="flex items-center shrink-0 pr-1">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onSelect(item.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-muted-foreground accent-primary cursor-pointer"
            aria-label={`${item.title} 선택`}
          />
        </div>
      )}

      {/* Thumbnail */}
      <YoutubeThumbnail src={item.thumbnailUrl} title={item.title} duration={item.duration} />

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary transition-colors">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.channelName}
          {dateLabel && ` · ${dateLabel}`}
        </p>

        {isSummarized && item.oneLiner && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground/80">
            {item.oneLiner}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-1">
          {/* Source tag (1개만) */}
          {sourceTags.slice(0, 1).map((tag) => (
            <span
              key={tag}
              className={cn(
                'inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                TAG_COLORS[tag] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {TAG_LABELS[tag] ?? tag.toUpperCase()}
            </span>
          ))}

          {isSummarized && item.summarySource === 'description' && (
            <span className="inline-block shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
              설명 기반
            </span>
          )}
          {isSummarizing && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              요약 중...
            </span>
          )}
          {/* 키워드: 텍스트로 · 구분 표시 */}
          {isSummarized && item.keywords && item.keywords.length > 0 && (
            <span className="truncate text-[10px] text-muted-foreground/70">
              {item.keywords.slice(0, 3).join(' · ')}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'group flex w-full gap-3 rounded-lg border bg-card p-3 transition-all duration-200 relative',
        savedVariant && isPinned ? 'border-2 border-primary' : 'border-border/60',
        'hover:border-primary/30 hover:shadow-sm hover:bg-accent/30',
        selected && 'ring-2 ring-primary border-primary/40',
        isSummarizing && 'opacity-60',
      )}
    >
      {savedVariant && isPinned && (
        <span
          aria-hidden="true"
          className="absolute -top-2 left-3 px-1.5 py-0.5 bg-primary text-primary-foreground font-mono text-[9px] uppercase tracking-[0.14em] font-semibold rounded-sm"
        >
          pinned
        </span>
      )}
      <div className="flex flex-col min-w-0 flex-1 gap-1">
        <button
          type="button"
          onClick={() => {
            if (onSelect && !onClick) onSelect(item.id);
            else onClick?.(item.id);
          }}
          className="flex gap-3 min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
        >
          {cardContent}
        </button>

        {/* Inline note (bookmark tab) */}
        {showMemo && onMemoChange && (
          <InlineNote
            key={item.note ?? ''}
            itemId={item.id}
            initialMemo={item.note}
            onMemoChange={onMemoChange}
          />
        )}
      </div>

      {/* Right actions — 선택 모드에서는 숨김 */}
      {!onSelect && <div className="flex flex-col items-center justify-start shrink-0">
        {onTogglePin && (
          <button
            type="button"
            onClick={() => {
              if (pinDisabled) return;
              onTogglePin(item.id, !isPinned);
            }}
            disabled={pinDisabled}
            className={cn(
              'p-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md transition-colors cursor-pointer',
              isPinned
                ? 'text-primary'
                : 'text-muted-foreground/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground/40',
            )}
            aria-label={isPinned ? '고정 해제' : pinDisabled ? '고정 3개 가득참' : '상단에 고정'}
            title={pinDisabled ? 'Pin limit: 3' : undefined}
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        )}
        {onToggleBookmark && (
          <button
            type="button"
            onClick={() => onToggleBookmark(item.id)}
            className={cn(
              'p-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md transition-colors cursor-pointer',
              item.isBookmarked
                ? 'text-primary'
                : 'text-muted-foreground/40 hover:text-primary/60',
            )}
            aria-label={item.isBookmarked ? '북마크 해제' : '북마크'}
          >
            {item.isBookmarked ? (
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="p-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            aria-label={`${item.title} 삭제`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>}
    </div>
  );
});
