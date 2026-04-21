'use client';

import {Download, Search, Star, X} from 'lucide-react';
import {cn} from '@/lib/utils';

export type YoutubeTab = 'feed' | 'create';
export type YoutubeStatus = 'unread' | 'read' | 'bookmarked';
export type YoutubePeriod = '3d' | '7d' | '30d';

/**
 * Fixed tag catalog shared between filter bar + source tagging UI. Only entries
 * that map to an active source are actually rendered as filter chips; the rest
 * are hidden (no empty-state noise).
 */
export const YOUTUBE_TAG_OPTIONS = [
  {value: 'economy', label: 'ECONOMY'},
  {value: 'dev', label: 'DEV'},
  {value: 'ai', label: 'AI'},
  {value: 'uxui', label: 'UX/UI'},
  {value: 'start-up', label: 'START-UP'},
] as const;

const STATUS_TABS: {value: YoutubeStatus; label: string}[] = [
  {value: 'unread', label: 'Unread'},
  {value: 'read', label: 'Read'},
  {value: 'bookmarked', label: 'Saved'},
];

const PERIODS: {value: YoutubePeriod; label: string}[] = [
  {value: '3d', label: '3D'},
  {value: '7d', label: '7D'},
  {value: '30d', label: '30D'},
];

export interface YoutubeFilterBarProps {
  tab: YoutubeTab;
  // Layer 1 — tag segments (both tabs)
  availableTags: string[];
  activeTag: string;
  onTagChange: (tag: string) => void;
  // Layer 2 — status row (feed) / collect row (create)
  status?: YoutubeStatus;
  onStatusChange?: (s: YoutubeStatus) => void;
  period?: YoutubePeriod;
  onPeriodChange?: (p: YoutubePeriod) => void;
  onStartCollect?: () => void;
  canCollect?: boolean;
  isCollecting?: boolean;
  feedStatusActions?: React.ReactNode;
  collectRowActions?: React.ReactNode;
  // Layer 3 — search (feed only)
  search?: string;
  onSearchChange?: (v: string) => void;
  onSearchClear?: () => void;
  // Layer 4 — favorite channels
  favoriteSources: {id: string; channelName: string}[];
  activeSourceId: string;
  onSourceIdChange: (id: string) => void;
}

export function YoutubeFilterBar({
  tab,
  availableTags,
  activeTag,
  onTagChange,
  status,
  onStatusChange,
  period,
  onPeriodChange,
  onStartCollect,
  canCollect,
  isCollecting,
  feedStatusActions,
  collectRowActions,
  search,
  onSearchChange,
  onSearchClear,
  favoriteSources,
  activeSourceId,
  onSourceIdChange,
}: YoutubeFilterBarProps) {
  const isFeed = tab === 'feed';
  const isCreate = tab === 'create';

  const visibleTags = YOUTUBE_TAG_OPTIONS.filter((t) => availableTags.includes(t.value));

  return (
    <div className="space-y-4">
      {/* Layer 1 — tag segments (mono em-dash text; avoids clash with main tab underline above) */}
      <div
        role="tablist"
        aria-label="태그"
        className="flex items-center gap-5 overflow-x-auto scrollbar-hide"
      >
        <TagTab label="All" isActive={activeTag === ''} onClick={() => onTagChange('')} />
        {visibleTags.map(({value, label}) => (
          <TagTab
            key={value}
            label={label}
            isActive={activeTag === value}
            onClick={() => onTagChange(activeTag === value ? '' : value)}
          />
        ))}
      </div>

      {/* Layer 2 — status row (feed) */}
      {isFeed && onStatusChange && status !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <div role="tablist" aria-label="상태" className="flex items-center gap-5">
            {STATUS_TABS.map(({value, label}) => {
              const isActive = value === status;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onStatusChange(value)}
                  className={cn(
                    'font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {isActive && (
                    <span className="mr-1.5" aria-hidden="true">
                      —
                    </span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          {feedStatusActions && (
            <div className="flex items-center gap-1.5">{feedStatusActions}</div>
          )}
        </div>
      )}

      {/* Layer 2 — collect row (create) */}
      {isCreate && !isCollecting && onPeriodChange && period !== undefined && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-5 flex-wrap">
            <div role="radiogroup" aria-label="수집 기간" className="flex items-center gap-5">
              {PERIODS.map((p) => {
                const isActive = period === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => onPeriodChange(p.value)}
                    className={cn(
                      'font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
                      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {isActive && (
                      <span className="mr-1.5" aria-hidden="true">
                        —
                      </span>
                    )}
                    {p.label}
                  </button>
                );
              })}
            </div>
            {onStartCollect && (
              <button
                type="button"
                onClick={onStartCollect}
                disabled={!canCollect}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5',
                  'font-mono text-[11px] uppercase tracking-[0.1em]',
                  'bg-primary text-primary-foreground transition-colors cursor-pointer',
                  'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary',
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Collect
              </button>
            )}
          </div>
          {collectRowActions && (
            <div className="flex items-center gap-1.5">{collectRowActions}</div>
          )}
        </div>
      )}

      {/* Layer 3 — search (feed only, hairline) */}
      {isFeed && onSearchChange !== undefined && search !== undefined && (
        <div className="relative">
          <Search
            className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search videos…"
            maxLength={100}
            aria-label="영상 검색"
            className={cn(
              'w-full h-10 pl-6 pr-7 bg-transparent',
              'border-b border-border',
              'text-base placeholder:text-muted-foreground',
              'focus:outline-none focus:border-primary',
              'transition-colors',
            )}
          />
          {search && onSearchClear && (
            <button
              type="button"
              onClick={onSearchClear}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-primary transition-colors"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Layer 4 — favorite channels */}
      {favoriteSources.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {favoriteSources.map((source) => {
            const active = activeSourceId === source.id;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onSourceIdChange(active ? '' : source.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 shrink-0 rounded-sm px-2.5 py-1.5 text-xs',
                  'transition-colors cursor-pointer border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
                )}
              >
                <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                <span className="max-w-[120px] truncate">{source.channelName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagTab({label, isActive, onClick}: {label: string; isActive: boolean; onClick: () => void}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        'shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] whitespace-nowrap transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {isActive && (
        <span className="mr-1.5" aria-hidden="true">
          —
        </span>
      )}
      {label}
    </button>
  );
}
