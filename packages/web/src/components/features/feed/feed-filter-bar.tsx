'use client';

import {Link2, Star} from 'lucide-react';
import {cn} from '@/lib/utils';
import {FeedFilters, type StatusFilter} from './feed-filters';
import {FeedSearch} from './feed-search';

export type SortMode = 'latest' | 'recommended';

export interface FeedFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  sourceId: string;
  onSourceIdChange: (sourceId: string) => void;
  favoriteSources: {id: string; name: string}[];
  manualSourceId?: string | null;
  statusActions?: React.ReactNode;
}

export function FeedFilterBar({
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  status,
  onStatusChange,
  selectedTags,
  onTagsChange,
  sort,
  onSortChange,
  sourceId,
  onSourceIdChange,
  favoriteSources,
  manualSourceId,
  statusActions,
}: FeedFilterBarProps) {
  const hasFavorites = manualSourceId || favoriteSources.length > 0;

  return (
    <div className="space-y-4 mb-6">
      <FeedFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        status={status}
        onStatusChange={onStatusChange}
        selectedTags={selectedTags}
        onTagsChange={onTagsChange}
        statusActions={statusActions}
      />

      <FeedSearch value={search} onChange={onSearchChange} />

      {hasFavorites && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {manualSourceId && (
            <FavoriteChip
              active={sourceId === manualSourceId}
              onClick={() =>
                onSourceIdChange(sourceId === manualSourceId ? '' : manualSourceId)
              }
              icon={<Link2 className="h-3 w-3" aria-hidden="true" />}
              label="직접 추가"
            />
          )}
          {favoriteSources.map((src) => (
            <FavoriteChip
              key={src.id}
              active={sourceId === src.id}
              onClick={() => onSourceIdChange(sourceId === src.id ? '' : src.id)}
              icon={<Star className="h-3 w-3 fill-current" aria-hidden="true" />}
              label={src.name}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-5">
        <SortButton
          active={sort === 'latest'}
          onClick={() => onSortChange('latest')}
          label={status === 'read' ? 'Recently read' : 'Latest'}
        />
        <SortButton
          active={sort === 'recommended'}
          onClick={() => onSortChange('recommended')}
          label="Recommended"
        />
      </div>
    </div>
  );
}

function FavoriteChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 shrink-0 rounded-sm px-2.5 py-1.5 text-xs',
        'transition-colors cursor-pointer border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-primary/10 text-primary border-primary/40'
          : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SortButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {active && (
        <span className="mr-1.5" aria-hidden="true">
          —
        </span>
      )}
      {label}
    </button>
  );
}
