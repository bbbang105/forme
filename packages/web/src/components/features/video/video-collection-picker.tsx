'use client';

import {useCallback, useEffect, useRef, useState, useTransition} from 'react';
import {Check, FolderOpen, Plus, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {VideoCollection} from './video-collection-manager';
import {createVideoCollection} from '@/lib/actions/video-collections';

const QUICK_COLORS = [
  '#0ea5e9', '#a855f7', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
];

interface VideoCollectionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: VideoCollection[];
  currentCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
}

export function VideoCollectionPicker({
  open,
  onOpenChange,
  collections,
  currentCollectionId,
  onSelect,
}: VideoCollectionPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleClose = useCallback(() => {
    setAdding(false);
    setNewName('');
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const firstBtn = listRef.current?.querySelector<HTMLButtonElement>('button');
    firstBtn?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  if (!open) return null;

  const handleSelect = (id: string | null) => {
    onSelect(id);
    handleClose();
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const color = QUICK_COLORS[collections.length % QUICK_COLORS.length]!;
        const created = await createVideoCollection({name, color});
        setNewName('');
        setAdding(false);
        if (created) {
          // 바로 새 컬렉션 선택 (onSelect → fetchCollections에서 최신 목록 반영)
          onSelect(created.id);
          handleClose();
        }
      } catch { /* ignore */ }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/40"
        onClick={handleClose}
      />

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[100] bg-card border-t border-border rounded-t-2xl animate-slide-up">
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
          className="px-4 pb-4 space-y-0.5 max-h-[240px] overflow-y-auto"
        >
          <button
            role="option"
            aria-selected={currentCollectionId === null}
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              currentCollectionId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>없음</span>
            {currentCollectionId === null && <Check className="h-4 w-4 ml-auto" aria-hidden="true" />}
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
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{backgroundColor: col.color}}
              />
              <span>{col.name}</span>
              {currentCollectionId === col.id && <Check className="h-4 w-4 ml-auto text-primary" aria-hidden="true" />}
            </button>
          ))}

          {collections.length === 0 && !adding && (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <FolderOpen className="h-8 w-8 opacity-40" aria-hidden="true" />
              <p className="text-xs">컬렉션이 없습니다. 아래에서 만들어보세요!</p>
            </div>
          )}
        </div>

        {/* 컬렉션 추가 */}
        <div className="px-4 pb-6">
          {adding ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                }}
                placeholder="컬렉션 이름…"
                aria-label="새 컬렉션 이름"
                maxLength={50}
                className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || isPending}
                className="shrink-0 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-colors"
              >
                추가
              </button>
            </div>
          ) : (
            collections.length < 10 && (
              <button
                onClick={() => setAdding(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                새 컬렉션 만들기
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}
