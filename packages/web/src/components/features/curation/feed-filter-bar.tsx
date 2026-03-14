'use client';

import {Clock, Sparkles, Star} from 'lucide-react';
import {cn} from '@/lib/utils';
import {CurationFilters, type StatusFilter} from './curation-filters';
import {CurationSearch} from './curation-search';

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
  favoriteSources: { id: string; name: string }[];
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
  statusActions,
}: FeedFilterBarProps) {
  return (
    <>
      {/* Category segment tabs (맨 위) */}
      <div className="mb-3">
        <CurationFilters
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
          status={status}
          onStatusChange={onStatusChange}
          selectedTags={selectedTags}
          onTagsChange={onTagsChange}
          statusActions={statusActions}
        />
      </div>

      {/* Search */}
      <div className="mb-3">
        <CurationSearch
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {/* Favorite sources bar */}
      {favoriteSources.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {favoriteSources.map((src) => (
            <button
              key={src.id}
              onClick={() =>
                onSourceIdChange(sourceId === src.id ? '' : src.id)
              }
              className={cn(
                'inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border',
                sourceId === src.id
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Star className="h-3 w-3 text-amber-500" fill="currentColor" />
              {src.name}
            </button>
          ))}
        </div>
      )}

      {/* Sort toggle */}
      <div className="flex items-center gap-1.5 mb-4">
        <SortButton
          active={sort === 'latest'}
          onClick={() => onSortChange('latest')}
          icon={<Clock className="h-3.5 w-3.5" />}
          label={status === 'read' ? '최근 읽은 순' : '최신순'}
        />
        <SortButton
          active={sort === 'recommended'}
          onClick={() => onSortChange('recommended')}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="추천순"
        />
      </div>
    </>
  );
}

export function SortButton({
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
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
        'transition-colors cursor-pointer',
        active
          ? 'bg-foreground text-background'
          : 'border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
