import {Skeleton} from '@/components/ui/skeleton';

type Tab = 'feed' | 'create';

interface YoutubeFeedSkeletonProps {
  tab?: Tab;
}

/**
 * Loading skeleton — shape matches the rendered layout for the given tab.
 * Feed tab: mobile magazine grid + desktop hairline list. Create tab: compact list rows.
 */
export function YoutubeFeedSkeleton({tab = 'feed'}: YoutubeFeedSkeletonProps) {
  if (tab === 'create') {
    return (
      <div role="status" aria-busy={true} aria-label="유튜브 수집 목록 불러오는 중" className="space-y-2">
        {Array.from({length: 6}).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-md border border-border/60 p-3"
          >
            <Skeleton className="w-[144px] h-[80px] shrink-0 rounded-sm" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // feed tab — magazine grid (mobile) + hairline list (desktop)
  return (
    <div role="status" aria-busy={true} aria-label="유튜브 피드 불러오는 중">
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-10">
        {Array.from({length: 4}).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[16/10] w-full rounded-sm" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </div>
      <div className="hidden lg:block divide-y divide-border/60">
        {Array.from({length: 6}).map((_, i) => (
          <div key={i} className="flex items-start gap-5 py-5">
            <Skeleton className="w-[140px] h-[90px] rounded-sm shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
