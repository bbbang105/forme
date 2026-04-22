'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {MessageSquare} from 'lucide-react';
import {cn} from '@/lib/utils';
import {ITEM_NOTE_MAX_LENGTH} from '@/lib/constants';

interface InlineNoteProps {
  itemId: string;
  initialMemo: string | null;
  onMemoChange: (id: string, note: string | null) => void;
}

/**
 * Shared inline note primitive for Saved items (Feed + YouTube).
 *
 * Collapsed: "Add note" button (empty) or hairline memo preview (has value).
 * Edit mode: auto-growing textarea that expands with content — starts at ~2 rows
 * and grows as the user types so the full note is always visible without
 * overflow scrolling. Save on blur / Enter (shift+Enter for newline) / Cmd+Enter.
 * Escape / Cancel discards the draft.
 */
export function InlineNote({
  itemId,
  initialMemo,
  onMemoChange,
}: InlineNoteProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialMemo ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(false);

  // Auto-grow: reset height to auto then set to scrollHeight on every value change.
  // Runs after focus (when entering edit mode) and after each keystroke.
  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      autoSize();
    }
  }, [editing, autoSize]);

  const save = useCallback(() => {
    if (savingRef.current) return;
    const trimmed = value.trim();
    const newMemo = trimmed || null;
    if (newMemo !== (initialMemo ?? null)) {
      savingRef.current = true;
      onMemoChange(itemId, newMemo);
      queueMicrotask(() => {
        savingRef.current = false;
      });
    }
    setEditing(false);
  }, [value, initialMemo, itemId, onMemoChange]);

  const cancel = useCallback(() => {
    setValue(initialMemo ?? '');
    setEditing(false);
  }, [initialMemo]);

  const openEditor = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(true);
  }, []);

  // ── Collapsed: empty ─────────────────────────────────────────────────────
  if (!editing && !initialMemo) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 hover:text-primary transition-colors mt-2"
        aria-label="노트 추가"
      >
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        <span>Add note</span>
      </button>
    );
  }

  // ── Collapsed: has memo ──────────────────────────────────────────────────
  if (!editing) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className="w-full text-left mt-2 pl-3 py-1 border-l-2 border-primary/40 text-xs text-muted-foreground hover:border-primary transition-colors"
        aria-label="노트 수정"
      >
        <span className="whitespace-pre-wrap">{initialMemo}</span>
      </button>
    );
  }

  // ── Editing: auto-growing textarea ───────────────────────────────────────
  return (
    <div
      className="mt-2 pl-3 border-l-2 border-primary"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoSize();
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={ITEM_NOTE_MAX_LENGTH}
        rows={2}
        placeholder="노트를 입력하세요…"
        aria-label="노트 입력"
        className={cn(
          'w-full bg-transparent text-foreground placeholder:text-muted-foreground/50',
          'resize-none focus:outline-none overflow-hidden',
          'text-base sm:text-sm leading-relaxed',
        )}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
          {value.length}/{ITEM_NOTE_MAX_LENGTH}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            // Use onPointerDown so the textarea's onBlur (which saves) doesn't
            // fire before cancel runs — unified across mouse + touch (iOS PWA).
            onPointerDown={(e) => {
              e.preventDefault();
              cancel();
            }}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              save();
            }}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-primary hover:text-primary/80"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
