'use client';

import {useState} from 'react';
import {
    BookmarkIcon,
    Bot,
    ChevronDown,
    ChevronUp,
    Code2,
    LayoutGrid,
    Mail,
    MailOpen,
    Palette,
    RotateCcw,
    Tag,
    TrendingUp,
} from 'lucide-react';
import {INTEREST_OPTIONS} from '@forme/shared/config';
import {cn} from '@/lib/utils';

export type StatusFilter = 'unread' | 'read' | 'bookmarked';

/** Fixed 4 categories + all */
const CATEGORY_TABS = [
  { value: '', label: '전체', icon: LayoutGrid },
  { value: 'ai', label: 'AI', icon: Bot },
  { value: 'dev', label: 'DEV', icon: Code2 },
  { value: 'uxui', label: 'UXUI', icon: Palette },
  { value: 'economy', label: 'ECONOMY', icon: TrendingUp },
] as const;

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
  selectedCategory,
  onCategoryChange,
  status,
  onStatusChange,
  selectedTags,
  onTagsChange,
}: CurationFiltersProps) {
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
      {/* Category segment tabs */}
      <div className="flex rounded-xl bg-muted/50 p-1 gap-0.5">
        {CATEGORY_TABS.map(({ value, label, icon: Icon }) => {
          const isActive = value === selectedCategory;
          return (
            <button
              key={value}
              onClick={() => onCategoryChange(value)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-semibold',
                'transition-all cursor-pointer',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5">
        <StatusChip
          active={status === 'unread'}
          onClick={() => onStatusChange('unread')}
          icon={<Mail className="h-3.5 w-3.5" />}
          label="안읽은 글"
        />
        <StatusChip
          active={status === 'read'}
          onClick={() => onStatusChange('read')}
          icon={<MailOpen className="h-3.5 w-3.5" />}
          label="읽은 글"
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
                    'transition-all cursor-pointer ring-1 ring-inset',
                    isSelected
                      ? 'bg-primary/15 text-primary ring-primary/30'
                      : 'text-muted-foreground ring-border hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={() => onTagsChange([])}
                className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors cursor-pointer"
                aria-label="태그 초기화"
              >
                <RotateCcw className="h-3.5 w-3.5" />
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
