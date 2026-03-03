'use client';

import { useState } from 'react';
import { BookmarkIcon, ChevronDown, ChevronUp, Eye, EyeOff, Tag } from 'lucide-react';
import { INTEREST_OPTIONS, getTagColor } from '@forme/shared/config';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/curation-utils';

export type StatusFilter = '' | 'unread' | 'bookmarked';

interface CurationFiltersProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function CurationFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  status,
  onStatusChange,
  selectedTags,
  onTagsChange,
}: CurationFiltersProps) {
  const allCategories = ['all', ...new Set(categories)];
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Category pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {allCategories.map((cat) => {
          const isActive = cat === selectedCategory || (cat === 'all' && !selectedCategory);
          const style = cat === 'all' ? null : getCategoryStyle(cat);

          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat === 'all' ? '' : cat)}
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium',
                'transition-colors shrink-0 cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {cat === 'all' ? '전체' : style?.label ?? cat}
            </button>
          );
        })}
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5">
        <StatusChip
          active={status === ''}
          onClick={() => onStatusChange('')}
          icon={<Eye className="h-3.5 w-3.5" />}
          label="모든 글"
        />
        <StatusChip
          active={status === 'unread'}
          onClick={() => onStatusChange('unread')}
          icon={<EyeOff className="h-3.5 w-3.5" />}
          label="안읽은 글"
        />
        <StatusChip
          active={status === 'bookmarked'}
          onClick={() => onStatusChange('bookmarked')}
          icon={<BookmarkIcon className="h-3.5 w-3.5" />}
          label="북마크"
        />
      </div>

      {/* Tag filter */}
      <div>
        <button
          onClick={() => setTagsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Tag className="h-3.5 w-3.5" />
          태그 필터
          {selectedTags.length > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-primary text-primary-foreground text-[10px] px-1">
              {selectedTags.length}
            </span>
          )}
          {tagsExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {tagsExpanded && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INTEREST_OPTIONS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                    'transition-all cursor-pointer',
                    getTagColor(tag, isSelected),
                    !isSelected && 'hover:opacity-80'
                  )}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={() => onTagsChange([])}
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({
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
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
