'use client';

import Link from 'next/link';
import {Pin} from 'lucide-react';
import {cn} from '@/lib/utils';

interface MemoCardProps {
  memo: {
    id: string;
    title: string | null;
    contentText: string;
    isPinned: boolean;
    updatedAt: Date;
  };
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

export function MemoCard({ memo }: MemoCardProps) {
  const displayTitle = memo.title?.trim() || '제목 없음';
  const preview = memo.contentText.slice(0, 100);

  return (
    <Link
      href={`/memo/${memo.id}`}
      className={cn(
        'block px-4 py-3 hover:bg-accent/50 active:bg-accent transition-colors',
        'border-b border-border/50 last:border-b-0',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {memo.isPinned && (
              <Pin className="h-3 w-3 text-primary shrink-0" />
            )}
            <h3 className={cn(
              'text-sm font-semibold truncate',
              !memo.title?.trim() && 'text-muted-foreground',
            )}>
              {displayTitle}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeDate(new Date(memo.updatedAt))}
            </span>
            {preview && (
              <>
                <span className="text-xs text-muted-foreground/50">·</span>
                <p className="text-xs text-muted-foreground truncate">
                  {preview}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
