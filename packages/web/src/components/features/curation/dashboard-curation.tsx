'use client';

import {useEffect, useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight, ExternalLink} from 'lucide-react';
import {Skeleton} from '@/components/ui/skeleton';
import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle,} from '@/lib/curation-utils';
import type {CurationItemData} from './curation-card';

export function DashboardCuration() {
  const [items, setItems] = useState<CurationItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/curation?status=unread&limit=3');
        if (res.ok) {
          const data = await res.json();
          setItems(data.items);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/60">
            <Skeleton className="w-16 h-12 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">최신 큐레이션</h3>
        <Link
          href="/curation"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          더보기
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <MiniCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function MiniCard({ item }: { item: CurationItemData }) {
  const catStyle = getCategoryStyle(item.category);
  const relativeDate = formatRelativeDate(item.publishedAt);
  const [imgFailed, setImgFailed] = useState(false);
  const gradient = getArticleGradient(item.title);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border border-border/60',
        'hover:border-primary/30 hover:shadow-sm transition-all',
      )}
    >
      {/* Mini thumbnail */}
      <div className="w-16 h-12 rounded-md overflow-hidden bg-muted shrink-0">
        {item.thumbnailUrl && !imgFailed ? (
          <Image
            src={item.thumbnailUrl}
            alt=""
            width={64}
            height={48}
            unoptimized
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className={cn('w-full h-full bg-gradient-to-br flex items-center justify-center', gradient)}>
            <span className="text-sm select-none opacity-60">📄</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              catStyle.bg,
              catStyle.text,
              catStyle.ring
            )}
          >
            {catStyle.label}
          </span>
          {item.sourceName && (
            <span className="text-xs text-muted-foreground truncate">
              {item.sourceName}
            </span>
          )}
          {relativeDate && (
            <span className="text-xs text-muted-foreground">{relativeDate}</span>
          )}
        </div>
      </div>

      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
    </a>
  );
}
