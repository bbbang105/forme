import { Suspense } from 'react';
import { FeedList } from '@/components/features/feed/feed-list';
import { Skeleton } from '@/components/ui/skeleton';

function FeedListSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 py-4">
            <Skeleton className="w-[100px] h-[64px] rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedListSkeleton />}>
      <FeedList />
    </Suspense>
  );
}
