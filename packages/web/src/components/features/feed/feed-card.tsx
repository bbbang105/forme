'use client';

import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Image from 'next/image';
import {Bookmark, BookmarkCheck, Check, FileText, MessageSquare, Pin, PinOff, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {ITEM_MEMO_MAX_LENGTH} from '@/lib/constants';
import {formatRelativeDate, getArticleGradient, getCategoryStyle} from '@/lib/feed-utils';
import {Checkbox} from '@/components/ui/checkbox';
import {useSwipeAction} from '@/hooks/use-swipe-action';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isNew(collectedAt: string): boolean {
  return Date.now() - new Date(collectedAt).getTime() < ONE_DAY_MS;
}

export interface FeedItemData {
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
  /** ISO string if the bookmark is pinned to the top of the Saved view, otherwise null. */
  pinnedAt: string | null;
}

interface FeedCardProps {
  item: FeedItemData;
  onToggleBookmark: (id: string, isBookmarked: boolean) => void;
  onMarkRead: (id: string) => void;
  onDelete?: (id: string) => void;
  onMemoChange?: (id: string, memo: string | null) => void;
  /** Toggle pin state. When omitted, the pin button isn't rendered. */
  onTogglePin?: (id: string, pinned: boolean) => void;
  /** When true, a *new* pin is blocked (already 3 pinned). Has no effect on items that are already pinned. */
  pinLocked?: boolean;
  showMemo?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  compact?: boolean;
  /** Render the saved-view variant: ember border when pinned, full memo body, no description. */
  savedVariant?: boolean;
}

// ─── Thumbnail ──────────────────────────────────────────────────────────
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
      <div className={cn('bg-gradient-to-br flex items-center justify-center', gradient, className)}>
        <FileText className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
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

// ─── Inline Memo (bookmark + read tabs) ─────────────────────────────────
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
        maxLength={ITEM_MEMO_MAX_LENGTH}
        rows={2}
        placeholder="메모를 입력하세요…"
        aria-label="메모 입력"
        className="w-full text-base sm:text-sm bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {value.length}/{ITEM_MEMO_MAX_LENGTH}
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

// ─── Swipe Backgrounds ──────────────────────────────────────────────────
function SwipeBackground({direction}: {direction: 'left' | 'right'}) {
  if (direction === 'right') {
    return (
      <div className="absolute inset-0 bg-primary/10 flex items-center pl-5 pointer-events-none">
        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>Mark read</span>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-destructive/10 flex items-center justify-end pr-5 pointer-events-none">
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-destructive">
        <span>Delete</span>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Meta Row ────────────────────────────────────────────────────────────
function MetaRow({
  catStyle,
  sourceName,
  dateLabel,
  tags,
  isNewItem,
}: {
  catStyle: ReturnType<typeof getCategoryStyle>;
  sourceName: string | null;
  dateLabel: string | null;
  tags?: string[] | null;
  isNewItem?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground flex-wrap min-w-0">
      {isNewItem && (
        <span className="text-primary font-semibold shrink-0">
          <span aria-hidden="true">—</span> NEW
        </span>
      )}
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
      {tags?.map((tag) => (
        <span key={tag} className="text-primary shrink-0">
          #{tag}
        </span>
      ))}
      {sourceName && <span className="truncate">{sourceName}</span>}
      {dateLabel && (
        <>
          <span className="text-primary shrink-0" aria-hidden="true">
            ·
          </span>
          <span className="shrink-0">{dateLabel}</span>
        </>
      )}
    </div>
  );
}

// ─── Action Buttons ─────────────────────────────────────────────────────
function ActionButtons({
  item,
  onBookmark,
  onDelete,
  onTogglePin,
  pinLocked = false,
  size = 'md',
}: {
  item: FeedItemData;
  onBookmark: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
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
    </div>
  );
}

// ─── FeedCard (mobile/tablet grid) ──────────────────────────────────────

export const FeedCard = memo(function FeedCard({
  item,
  onToggleBookmark,
  onMarkRead,
  onDelete,
  onMemoChange,
  onTogglePin,
  pinLocked,
  showMemo,
  selectMode,
  selected,
  onToggleSelect,
  compact,
  savedVariant,
}: FeedCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);
  const isNewItem = isNew(item.collectedAt);
  const isPinned = Boolean(item.pinnedAt);

  const {containerRef, handlers} = useSwipeAction({
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
    if (!item.isRead) onMarkRead(item.id);
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

  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(item.id, !isPinned);
  };

  // Compact: horizontal row (not currently used in app but kept for flexibility)
  if (compact) {
    return (
      <div className="relative overflow-hidden">
        <SwipeBackground direction="right" />
        <SwipeBackground direction="left" />
        <div ref={containerRef} {...(selectMode ? {} : handlers)}>
          <a
            href={selectMode ? undefined : item.url}
            target={selectMode ? undefined : '_blank'}
            rel={selectMode ? undefined : 'noopener noreferrer'}
            onClick={handleClick}
            className={cn(
              'group relative flex items-start gap-3 py-3 bg-background',
              'transition-colors',
              selectMode && 'cursor-pointer',
              selected && 'bg-primary/5',
            )}
          >
            {selectMode && (
              <div className="flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]">
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect?.(item.id)}
                  className="h-5 w-5 border-2"
                />
              </div>
            )}
            <div className="w-[80px] h-[52px] shrink-0 rounded-sm overflow-hidden bg-muted">
              <Thumbnail src={item.thumbnailUrl} title={item.title} className="w-full h-full" />
            </div>
            <div className="flex flex-col flex-1 min-w-0 gap-1.5">
              <h3 className="font-display text-base leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              <MetaRow
                catStyle={catStyle}
                sourceName={item.sourceName}
                dateLabel={dateLabel}
                isNewItem={isNewItem}
              />
            </div>
            {!selectMode && (
              <ActionButtons
                item={item}
                onBookmark={handleBookmark}
                onDelete={handleDelete}
                size="sm"
              />
            )}
          </a>
        </div>
      </div>
    );
  }

  // Default: magazine grid card (thumbnail on top, body below).
  // savedVariant (Saved tab) adds ember border + `pinned` label when pinned,
  // and promotes memo to the body (no description shown).
  return (
    <div className="relative overflow-hidden">
      <SwipeBackground direction="right" />
      <SwipeBackground direction="left" />
      <div ref={containerRef} {...(selectMode ? {} : handlers)}>
        <a
          href={selectMode ? undefined : item.url}
          target={selectMode ? undefined : '_blank'}
          rel={selectMode ? undefined : 'noopener noreferrer'}
          onClick={handleClick}
          className={cn(
            'group relative flex flex-col bg-background',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            savedVariant && 'rounded-md p-4',
            savedVariant && isPinned && 'border-2 border-primary',
            savedVariant && !isPinned && 'border border-border',
            selectMode && 'cursor-pointer',
            selected && 'bg-primary/5',
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
                onCheckedChange={() => onToggleSelect?.(item.id)}
                className="h-5 w-5 border-2 bg-background/80 backdrop-blur-sm"
              />
            </div>
          )}

          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm bg-muted">
            <Thumbnail src={item.thumbnailUrl} title={item.title} className="w-full h-full" />
          </div>

          <div className="flex flex-col flex-1 gap-2.5 pt-3">
            <MetaRow
              catStyle={catStyle}
              sourceName={item.sourceName}
              dateLabel={dateLabel}
              tags={item.tags}
              isNewItem={isNewItem}
            />

            <h3 className="font-display text-lg leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h3>

            {!savedVariant && item.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            )}

            {/* Inline memo (bookmark / read tabs) */}
            {showMemo && !selectMode && onMemoChange && (
              <InlineMemo
                key={item.memo ?? ''}
                itemId={item.id}
                initialMemo={item.memo}
                onMemoChange={onMemoChange}
              />
            )}

            <div className="flex items-center justify-end mt-auto pt-1">
              {!selectMode && (
                <ActionButtons
                  item={item}
                  onBookmark={handleBookmark}
                  onDelete={handleDelete}
                  onTogglePin={onTogglePin ? handleTogglePin : undefined}
                  pinLocked={pinLocked}
                />
              )}
            </div>
          </div>
        </a>
      </div>
    </div>
  );
});

// ─── FeedListRow (desktop list) ──────────────────────────────────────────

export const FeedListRow = memo(function FeedListRow({
  item,
  onToggleBookmark,
  onMarkRead,
  onDelete,
  onMemoChange,
  onTogglePin,
  pinLocked,
  showMemo,
  selectMode,
  selected,
  onToggleSelect,
}: FeedCardProps) {
  const catStyle = getCategoryStyle(item.category);
  const dateLabel = formatRelativeDate(item.publishedAt ?? item.collectedAt);
  const isNewItem = isNew(item.collectedAt);
  const isPinned = Boolean(item.pinnedAt);

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(item.id);
      return;
    }
    if (!item.isRead) onMarkRead(item.id);
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

  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(item.id, !isPinned);
  };

  return (
    <a
      href={selectMode ? undefined : item.url}
      target={selectMode ? undefined : '_blank'}
      rel={selectMode ? undefined : 'noopener noreferrer'}
      onClick={handleClick}
      className={cn(
        'group flex items-start gap-5 py-5',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
        selectMode && 'cursor-pointer',
        selected && 'bg-primary/5 -mx-3 px-3',
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

      {/* Thumbnail */}
      <div className="w-[140px] h-[90px] shrink-0 rounded-sm overflow-hidden bg-muted">
        <Thumbnail src={item.thumbnailUrl} title={item.title} className="w-full h-full" />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-2">
        <MetaRow
          catStyle={catStyle}
          sourceName={item.sourceName}
          dateLabel={dateLabel}
          tags={item.tags}
          isNewItem={isNewItem}
        />

        <h3 className="font-display text-xl leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h3>

        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Inline memo (bookmark / read tabs) */}
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
      {!selectMode && (
        <div className="pt-1">
          <ActionButtons
            item={item}
            onBookmark={handleBookmark}
            onDelete={handleDelete}
            onTogglePin={onTogglePin ? handleTogglePin : undefined}
            pinLocked={pinLocked}
          />
        </div>
      )}
    </a>
  );
});
