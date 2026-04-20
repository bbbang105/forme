'use client';

import {useState} from 'react';
import {ChevronDown, ChevronUp, RotateCcw, Tag} from 'lucide-react';
import {INTEREST_OPTIONS} from '@forme/shared/config';
import {cn} from '@/lib/utils';

export type StatusFilter = 'unread' | 'read' | 'bookmarked';

/** Fixed 4 categories + all. Mono uppercase labels (editorial section nav). */
const CATEGORY_TABS = [
  {value: '', label: 'All'},
  {value: 'ai', label: 'AI'},
  {value: 'dev', label: 'DEV'},
  {value: 'uxui', label: 'UXUI'},
  {value: 'economy', label: 'ECONOMY'},
] as const;

const STATUS_TABS = [
  {value: 'unread' as const, label: 'Unread'},
  {value: 'read' as const, label: 'Read'},
  {value: 'bookmarked' as const, label: 'Saved'},
];

interface FeedFiltersProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Extra actions to render at the end of status row (select, add, sources). */
  statusActions?: React.ReactNode;
}

export function FeedFilters({
  selectedCategory,
  onCategoryChange,
  status,
  onStatusChange,
  selectedTags,
  onTagsChange,
  statusActions,
}: FeedFiltersProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Category — underline tabs (editorial section nav) */}
      <div
        role="tablist"
        aria-label="카테고리"
        className="flex items-center gap-6 border-b border-border overflow-x-auto scrollbar-hide"
      >
        {CATEGORY_TABS.map(({value, label}) => {
          const isActive = value === selectedCategory;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(value)}
              className={cn(
                'py-3 font-mono text-[11px] uppercase tracking-[0.12em] whitespace-nowrap',
                '-mb-px border-b-2 transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Status row — mono text tabs with em-dash active marker + action slot */}
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
        {statusActions && <div className="flex items-center gap-1.5">{statusActions}</div>}
      </div>

      {/* Tag filter — subtle disclosure */}
      <div>
        <button
          type="button"
          onClick={() => setTagsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Tag className="h-3 w-3" aria-hidden="true" />
          Tags
          {selectedTags.length > 0 && (
            <span className="text-primary">{selectedTags.length}</span>
          )}
          {tagsExpanded ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
        </button>

        {tagsExpanded && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {INTEREST_OPTIONS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'inline-flex items-center rounded-sm px-2 py-0.5 text-[11px]',
                    'transition-colors cursor-pointer border',
                    isSelected
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
                  )}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={() => onTagsChange([])}
                className="inline-flex items-center justify-center h-6 w-6 rounded-sm text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                aria-label="태그 초기화"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
