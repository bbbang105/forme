'use client';

import { BookmarkIcon, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCategoryStyle } from '@/lib/curation-utils';

export type StatusFilter = '' | 'unread' | 'bookmarked';

interface CurationFiltersProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
}

export function CurationFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  status,
  onStatusChange,
}: CurationFiltersProps) {
  const allCategories = ['all', ...new Set(categories)];

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
