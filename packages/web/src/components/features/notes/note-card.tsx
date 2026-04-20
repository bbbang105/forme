'use client';

import type {ReactNode} from 'react';
import {memo, useMemo} from 'react';
import Link from 'next/link';
import {Pin} from 'lucide-react';
import {cn} from '@/lib/utils';

interface NoteCardProps {
  note: {
    id: string;
    title: string | null;
    contentText: string;
    isPinned: boolean;
    updatedAt: Date;
  };
  highlight?: string;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    }).format(date);
  }
  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return '방금';
}

/** Highlights matching text using a pre-compiled regex to avoid re-creating it per call. */
function highlightTextWithRegex(text: string, query: string, regex: RegExp | null): ReactNode {
  if (!query || !regex) return text;
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">{part}</mark>
      : <span key={i}>{part}</span>
  );
}

export const NoteCard = memo(function NoteCard({note, highlight = ''}: NoteCardProps) {
  const displayTitle = note.title?.trim() || '제목 없음';
  const preview = note.contentText.slice(0, 140);

  // Memoize the compiled RegExp separately so it is created once per highlight value change
  // rather than inside each highlightText call (which would re-create the regex every render).
  const highlightRegex = useMemo(() => {
    if (!highlight) return null;
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escaped})`, 'gi');
  }, [highlight]);

  const titleNode = useMemo(() => highlightTextWithRegex(displayTitle, highlight, highlightRegex), [displayTitle, highlight, highlightRegex]);
  const previewNode = useMemo(() => highlightTextWithRegex(preview, highlight, highlightRegex), [preview, highlight, highlightRegex]);

  return (
    <Link
      href={`/note/${note.id}`}
      className={cn(
        'group block px-4 sm:px-5 py-4 border-b border-border/60 last:border-b-0',
        'hover:bg-accent/30 transition-colors',
      )}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1.5 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          {note.isPinned && (
            <Pin className="h-3 w-3 text-primary shrink-0 relative top-0.5" aria-hidden="true" />
          )}
          <h3
            className={cn(
              'font-display text-lg leading-snug truncate group-hover:text-primary transition-colors',
              !note.title?.trim() && 'text-muted-foreground',
            )}
          >
            {titleNode}
          </h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground shrink-0">
          {formatRelativeDate(new Date(note.updatedAt))}
        </span>
      </div>
      {preview && (
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {previewNode}
        </p>
      )}
    </Link>
  );
});
