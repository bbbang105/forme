import {Skeleton} from '@/components/ui/skeleton';

function MemoCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border/50">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title line */}
          <Skeleton className="h-4 w-2/5 rounded" />
          {/* Date + preview line */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-12 rounded shrink-0" />
            <Skeleton className="h-3 w-3/5 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MemoListLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1.5">
            {/* Title "메모" */}
            <Skeleton className="h-5 w-16 rounded" />
            {/* Subtitle "N개의 메모" */}
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>

        {/* Search bar */}
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      {/* Section label */}
      <div className="px-4 py-2">
        <Skeleton className="h-3 w-10 rounded" />
      </div>

      {/* Memo card skeletons */}
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <MemoCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
