'use client';

import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Image from 'next/image';
import {Bookmark, BookmarkCheck, FileText, MessageSquare, Pin, PinOff, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {ITEM_NOTE_MAX_LENGTH} from '@/lib/constants';
import {formatDuration} from '@/lib/format-time';
import {formatRelativeDate, getArticleGradient, getCategoryStyle} from '@/lib/feed-utils';
import {Checkbox} from '@/components/ui/checkbox';
import type {SavedItemBase} from '@/lib/types/saved-item';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isNewlyCollected(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < ONE_DAY_MS;
}

export interface YoutubeItemData extends SavedItemBase {
  videoId: string;
  status: string;
  channelName: string;
  oneLiner: string | null;
  summarySource: string | null;
  keywords: string[] | null;
  duration: number | null;
  /** Set when the row was crawled (used for the "NEW" marker). Optional because some list responses may omit it. */
  collectedAt?: string;
}

interface CommonCardProps {
  item: YoutubeItemData;
  selected?: boolean;
  selectMode?: boolean;
  onSelect?: (id: string) => void;
  onClick?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleBookmark?: (id: string) => void;
  onMemoChange?: (id: string, note: string | null) => void;
  onTogglePin?: (id: string, pinned: boolean) => void;
  pinLocked?: boolean;
  savedVariant?: boolean;
  showMemo?: boolean;
  /** First source tag (e.g. "ai", "start-up"). Renders as a colored pill. */
  sourceTag?: string | null;
}

// ─── Thumbnail (with duration badge) ────────────────────────────────────
function Thumbnail({
  src,
  title,
  duration,
  className,
  sizes,
}: {
  src: string | null;
  title: string;
  duration: number | null;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(() => getArticleGradient(title), [title]);

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {!src || failed ? (
        <div className={cn('absolute inset-0 bg-gradient-to-br flex items-center justify-center', gradient)}>
          <FileText className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
        </div>
      ) : (
        <Image
          src={src}
          alt=""
          fill
          className="object-cover"
          sizes={sizes ?? '(max-width: 768px) 100vw, 33vw'}
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
      {duration != null && duration > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white tabular-nums">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

// ─── Meta Row ────────────────────────────────────────────────────────────
function MetaRow({
  isNewItem,
  tag,
  channelName,
  dateLabel,
  isSummarizing,
  isDesc,
}: {
  isNewItem?: boolean;
  tag?: string | null;
  channelName: string;
  dateLabel: string | null;
  isSummarizing?: boolean;
  isDesc?: boolean;
}) {
  const tagStyle = tag ? getCategoryStyle(tag) : null;
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground flex-wrap min-w-0">
      {isNewItem && (
        <span className="text-primary font-semibold shrink-0">
          <span aria-hidden="true">—</span> NEW
        </span>
      )}
      {tagStyle && (
        <span
          className={cn(
            'inline-flex rounded-sm px-1.5 py-0.5 ring-1 ring-inset normal-case tracking-normal shrink-0',
            tagStyle.bg,
            tagStyle.text,
            tagStyle.ring,
          )}
        >
          {tagStyle.label}
        </span>
      )}
      <span className="truncate">{channelName}</span>
      {dateLabel && (
        <>
          <span className="text-primary shrink-0" aria-hidden="true">·</span>
          <span className="shrink-0">{dateLabel}</span>
        </>
      )}
      {isSummarizing && (
        <span className="inline-flex shrink-0 items-center gap-1 text-primary">
          <span className="h-1 w-1 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
          summarizing
        </span>
      )}
      {isDesc && <span className="shrink-0">— desc</span>}
    </div>
  );
}

// ─── Action Buttons (pin / bookmark / delete) ───────────────────────────
function ActionButtons({
  item,
  onBookmark,
  onDelete,
  onTogglePin,
  pinLocked = false,
  size = 'md',
}: {
  item: YoutubeItemData;
  onBookmark?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onTogglePin?: (e: React.MouseEvent) => void;
  pinLocked?: boolean;
  size?: 'sm' | 'md';
}) {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const padding = size === 'sm' ? 'p-1' : 'p-1.5';
  const isPinned = Boolean(item.pinnedAt);
  const pinDisabled = !isPinned && pinLocked;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          disabled={pinDisabled}
          className={cn(
            'rounded-sm transition-colors cursor-pointer',
            padding,
            isPinned
              ? 'text-primary'
              : 'text-muted-foreground/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground/40',
          )}
          aria-label={isPinned ? '고정 해제' : pinDisabled ? '고정 3개 가득참' : '상단에 고정'}
          title={pinDisabled ? 'Pin limit: 3' : undefined}
        >
          {isPinned ? (
            <PinOff className={iconSize} aria-hidden="true" />
          ) : (
            <Pin className={iconSize} aria-hidden="true" />
          )}
        </button>
      )}
      {onBookmark && (
        <button
          type="button"
          onClick={onBookmark}
          className={cn(
            'rounded-sm transition-colors cursor-pointer',
            padding,
            item.isBookmarked
              ? 'text-primary'
              : 'text-muted-foreground/40 hover:text-primary/60',
          )}
          aria-label={item.isBookmarked ? '북마크 해제' : '북마크'}
        >
          {item.isBookmarked ? (
            <BookmarkCheck className={iconSize} aria-hidden="true" />
          ) : (
            <Bookmark className={iconSize} aria-hidden="true" />
          )}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            'rounded-sm text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer',
            padding,
          )}
          aria-label="삭제"
        >
          <Trash2 className={iconSize} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ─── Inline Note (bookmark + read tabs) ─────────────────────────────────
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
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = useCallback(() => {
    if (savingRef.current) return;
    const trimmed = value.trim();
    const newMemo = trimmed || null;
    if (newMemo !== (initialMemo ?? null)) {
      savingRef.current = true;
      onMemoChange(itemId, newMemo);
      queueMicrotask(() => {
        savingRef.current = false;
      });
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
        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 hover:text-primary transition-colors mt-2"
      >
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        <span>Add note</span>
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
        className="w-full text-left mt-2 pl-3 py-1 border-l-2 border-primary/40 text-xs text-muted-foreground hover:border-primary transition-colors"
      >
        <span className="whitespace-pre-wrap">{initialMemo}</span>
      </button>
    );
  }

  return (
    <div
      className="mt-2 pl-3 border-l-2 border-primary"
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
        className="w-full text-base sm:text-sm bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {value.length}/{ITEM_NOTE_MAX_LENGTH}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setValue(initialMemo ?? '');
              setEditing(false);
            }}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-primary hover:text-primary/80"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clickable card surface ─────────────────────────────────────────────
// Used by magazine + list row. Renders as a button (for keyboard + screen
// readers) — action buttons inside the card are siblings, not descendants,
// so the HTML stays valid.
function useCardClickHandlers({
  item,
  selectMode,
  onClick,
  onSelect,
}: {
  item: YoutubeItemData;
  selectMode?: boolean;
  onClick?: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const handleCardClick = useCallback(() => {
    if (selectMode) {
      onSelect?.(item.id);
      return;
    }
    onClick?.(item.id);
  }, [selectMode, onSelect, onClick, item.id]);
  return {handleCardClick};
}

// ─── Magazine Card (Feed tab mobile + Saved pinned & masonry) ───────────
export const YoutubeCard = memo(function YoutubeCard({
  item,
  selected,
  selectMode,
  onSelect,
  onClick,
  onDelete,
  onToggleBookmark,
  onMemoChange,
  onTogglePin,
  pinLocked,
  savedVariant,
  showMemo,
  sourceTag,
}: CommonCardProps) {
  const isSummarized = item.status === 'summarized';
  const isSummarizing = item.status === 'summarizing';
  const isDesc = isSummarized && item.summarySource === 'description';
  const dateLabel = formatRelativeDate(item.publishedAt);
  const isNewItem = isNewlyCollected(item.collectedAt);
  const isPinned = Boolean(item.pinnedAt);
  const {handleCardClick} = useCardClickHandlers({item, selectMode, onClick, onSelect});

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark?.(item.id);
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(item.id);
  };
  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(item.id, !isPinned);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col bg-background transition-colors',
        savedVariant && 'rounded-md p-4',
        savedVariant && isPinned && 'border-2 border-primary',
        savedVariant && !isPinned && 'border border-border',
        selected && 'bg-primary/5',
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

      {selectMode && (
        <div className="absolute top-2 left-2 z-10 flex items-center justify-center min-h-[44px] min-w-[44px]">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect?.(item.id)}
            className="h-5 w-5 border-2 bg-background/80 backdrop-blur-sm"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleCardClick}
        aria-label={item.title}
        className={cn(
          'text-left flex flex-col flex-1 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
        )}
      >
        <Thumbnail
          src={item.thumbnailUrl}
          title={item.title}
          duration={item.duration}
          className="aspect-[16/10] w-full rounded-sm"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="flex flex-col gap-2.5 pt-3">
          <MetaRow
            isNewItem={isNewItem}
            tag={sourceTag}
            channelName={item.channelName}
            dateLabel={dateLabel}
            isSummarizing={isSummarizing}
            isDesc={isDesc}
          />
          <h3 className="font-display text-lg leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          {!savedVariant && isSummarized && item.oneLiner && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {item.oneLiner}
            </p>
          )}
        </div>
      </button>

      {showMemo && !selectMode && onMemoChange && (
        <InlineNote
          key={item.note ?? ''}
          itemId={item.id}
          initialMemo={item.note}
          onMemoChange={onMemoChange}
        />
      )}

      {!selectMode && (
        <div className="flex items-center justify-end mt-auto pt-3">
          <ActionButtons
            item={item}
            onBookmark={onToggleBookmark ? handleBookmark : undefined}
            onDelete={onDelete ? handleDelete : undefined}
            onTogglePin={onTogglePin ? handleTogglePin : undefined}
            pinLocked={pinLocked}
          />
        </div>
      )}
    </div>
  );
});

// ─── List Row (Feed tab desktop) ────────────────────────────────────────
export const YoutubeListRow = memo(function YoutubeListRow({
  item,
  selected,
  selectMode,
  onSelect,
  onClick,
  onDelete,
  onToggleBookmark,
  onMemoChange,
  onTogglePin,
  pinLocked,
  showMemo,
  sourceTag,
}: CommonCardProps) {
  const isSummarized = item.status === 'summarized';
  const isSummarizing = item.status === 'summarizing';
  const isDesc = isSummarized && item.summarySource === 'description';
  const dateLabel = formatRelativeDate(item.publishedAt);
  const isNewItem = isNewlyCollected(item.collectedAt);
  const isPinned = Boolean(item.pinnedAt);
  const {handleCardClick} = useCardClickHandlers({item, selectMode, onClick, onSelect});

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark?.(item.id);
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(item.id);
  };
  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(item.id, !isPinned);
  };

  return (
    <div
      className={cn(
        'group py-5 transition-colors',
        selected && 'bg-primary/5 -mx-3 px-3 rounded-sm',
        isSummarizing && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-5">
        {selectMode && (
          <div className="flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect?.(item.id)}
              className="h-5 w-5 border-2"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleCardClick}
          aria-label={item.title}
          className={cn(
            'flex items-start gap-5 flex-1 min-w-0 text-left cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
          )}
        >
          <Thumbnail
            src={item.thumbnailUrl}
            title={item.title}
            duration={item.duration}
            className="w-[140px] h-[90px] shrink-0 rounded-sm"
            sizes="140px"
          />
          <div className="flex flex-col flex-1 min-w-0 gap-2">
            <MetaRow
              isNewItem={isNewItem}
              tag={sourceTag}
              channelName={item.channelName}
              dateLabel={dateLabel}
              isSummarizing={isSummarizing}
              isDesc={isDesc}
            />
            <h3 className="font-display text-xl leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            {isSummarized && item.oneLiner && (
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {item.oneLiner}
              </p>
            )}
          </div>
        </button>

        {!selectMode && (
          <div className="pt-1 shrink-0">
            <ActionButtons
              item={item}
              onBookmark={onToggleBookmark ? handleBookmark : undefined}
              onDelete={onDelete ? handleDelete : undefined}
              onTogglePin={onTogglePin ? handleTogglePin : undefined}
              pinLocked={pinLocked}
            />
          </div>
        )}
      </div>

      {/* InlineNote lives outside the clickable button — a textarea nested in
          a button is invalid HTML and breaks some screen readers. Indent to
          align under the text column (thumbnail width 140 + gap 20). */}
      {showMemo && !selectMode && onMemoChange && (
        <div className="pl-[160px] mt-2">
          <InlineNote
            key={item.note ?? ''}
            itemId={item.id}
            initialMemo={item.note}
            onMemoChange={onMemoChange}
          />
        </div>
      )}
    </div>
  );
});

// ─── Compact Row (Collect tab — dense workflow view) ────────────────────
export const YoutubeCompactRow = memo(function YoutubeCompactRow({
  item,
  selected,
  selectMode,
  onSelect,
  onClick,
  onDelete,
  sourceTag,
}: Pick<
  CommonCardProps,
  'item' | 'selected' | 'selectMode' | 'onSelect' | 'onClick' | 'onDelete' | 'sourceTag'
>) {
  const isSummarizing = item.status === 'summarizing';
  const dateLabel = formatRelativeDate(item.publishedAt);
  const {handleCardClick} = useCardClickHandlers({item, selectMode, onClick, onSelect});

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(item.id);
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-md border border-border/60 bg-card p-3 transition-colors',
        'hover:border-primary/30 hover:bg-accent/30',
        selected && 'ring-2 ring-primary border-primary/40',
        isSummarizing && 'opacity-60',
      )}
    >
      {selectMode && (
        <div className="flex items-center justify-center shrink-0 self-center min-h-[44px] min-w-[44px]">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect?.(item.id)}
            className="h-5 w-5 border-2"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleCardClick}
        aria-label={item.title}
        className={cn(
          'flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
        )}
      >
        <Thumbnail
          src={item.thumbnailUrl}
          title={item.title}
          duration={item.duration}
          className="w-[144px] h-[80px] shrink-0 rounded-sm"
          sizes="144px"
        />
        <div className="flex flex-col flex-1 min-w-0 gap-1.5">
          <h3 className="font-display text-base leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          <MetaRow
            tag={sourceTag}
            channelName={item.channelName}
            dateLabel={dateLabel}
            isSummarizing={isSummarizing}
          />
        </div>
      </button>

      {!selectMode && onDelete && (
        <div className="shrink-0 self-start">
          <button
            type="button"
            onClick={handleDelete}
            className="p-1.5 rounded-sm text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            aria-label="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
});
