'use client';

import {GripVertical, Loader2, Pencil, Star, Trash2} from 'lucide-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {cn} from '@/lib/utils';
import {getCategoryStyle} from '@/lib/curation-utils';

export interface Source {
  id: string;
  name: string;
  url: string;
  rssUrl: string | null;
  category: string;
  tags: string[] | null;
  isActive: boolean;
  isFavorite: boolean;
  favoriteOrder: number;
  createdAt: string;
}

export interface SourceCardProps {
  source: Source;
  deleting: string | null;
  isDraggable?: boolean;
  onToggleFavorite: (source: Source) => void;
  onToggleActive: (source: Source) => void;
  onEdit: (source: Source) => void;
  onDelete: (source: Source) => void;
}

export function SourceCard({
  source,
  deleting,
  isDraggable = false,
  onToggleFavorite,
  onToggleActive,
  onEdit,
  onDelete,
}: SourceCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id, disabled: !isDraggable });

  const style = isDraggable
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;

  const catStyle = getCategoryStyle(source.category);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 rounded-lg border border-border/60 space-y-2',
        !source.isActive && 'opacity-50',
        isDragging && 'opacity-50 shadow-lg z-10'
      )}
    >
      {/* Top: drag handle (if draggable) + name + category */}
      <div className="flex items-start gap-2">
        {isDraggable && (
          <button
            className="mt-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
            aria-label="드래그하여 순서 변경"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">
              {source.name}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset shrink-0',
                catStyle.bg,
                catStyle.text,
                catStyle.ring
              )}
            >
              {catStyle.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {source.url}
          </p>
          {!source.rssUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              RSS 미감지
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {source.tags && source.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {source.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary/10 ring-1 ring-inset ring-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onToggleFavorite(source)}
          className={cn(
            'p-1.5 rounded-md transition-colors cursor-pointer',
            source.isFavorite
              ? 'text-amber-500'
              : 'text-muted-foreground/40 hover:text-amber-500/60'
          )}
          aria-label={source.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
        >
          <Star
            className="h-3.5 w-3.5"
            fill={source.isFavorite ? 'currentColor' : 'none'}
          />
        </button>
        <button
          role="switch"
          aria-checked={source.isActive}
          onClick={() => onToggleActive(source)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer',
            source.isActive
              ? 'bg-emerald-500'
              : 'bg-muted-foreground/30'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5',
              source.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
            )}
          />
        </button>
        <button
          onClick={() => onEdit(source)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          aria-label="소스 수정"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(source)}
          disabled={deleting === source.id}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          aria-label="소스 삭제"
        >
          {deleting === source.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
