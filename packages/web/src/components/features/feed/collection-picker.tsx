'use client';

import {useEffect, useRef} from 'react';
import {Check, FolderOpen, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {BookmarkCollection} from './collection-manager';

interface CollectionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: BookmarkCollection[];
  currentCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
}

export function CollectionPicker({
  open,
  onOpenChange,
  collections,
  currentCollectionId,
  onSelect,
}: CollectionPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus first option + Escape handler
  useEffect(() => {
    if (!open) return;
    const firstBtn = listRef.current?.querySelector<HTMLButtonElement>('button');
    firstBtn?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSelect = (id: string | null) => {
    onSelect(id);
    onOpenChange(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/40"
        onClick={() => onOpenChange(false)}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[100] bg-card border-t border-border rounded-t-2xl animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-muted" />
        </div>

        <div className="px-4 pb-2">
          <p className="text-sm font-semibold">컬렉션에 추가</p>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="컬렉션 선택"
          className="px-4 pb-6 space-y-0.5 max-h-[240px] overflow-y-auto"
        >
          {/* 없음 */}
          <button
            role="option"
            aria-selected={currentCollectionId === null}
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              currentCollectionId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'
            )}
          >
            <X className="h-4 w-4" />
            <span>없음</span>
            {currentCollectionId === null && <Check className="h-4 w-4 ml-auto" />}
          </button>

          {collections.map((col) => (
            <button
              key={col.id}
              role="option"
              aria-selected={currentCollectionId === col.id}
              onClick={() => handleSelect(col.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                currentCollectionId === col.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
              )}
            >
              <span>{col.name}</span>
              {currentCollectionId === col.id && <Check className="h-4 w-4 ml-auto text-primary" />}
            </button>
          ))}

          {collections.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <FolderOpen className="h-8 w-8 opacity-40" />
              <p className="text-xs">컬렉션이 없습니다. 먼저 만들어보세요!</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
