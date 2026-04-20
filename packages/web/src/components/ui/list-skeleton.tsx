import {Skeleton} from '@/components/ui/skeleton';
import {cn} from '@/lib/utils';

interface ListSkeletonProps {
  /** Number of skeleton rows to render. Defaults to 4. */
  count?: number;
  /** Show a thumbnail/image placeholder on the left. Defaults to false. */
  showThumbnail?: boolean;
  /** Additional class names for the container. */
  className?: string;
}

/**
 * ListSkeleton — shared loading placeholder for feed/note list views.
 *
 * Renders a stack of animated skeleton rows that mimic a typical list item
 * layout (optional thumbnail + two lines of text). Use inside a Suspense
 * fallback or wherever a list is loading.
 *
 * @example
 * <Suspense fallback={<ListSkeleton count={5} showThumbnail />}>
 *   <FeedList />
 * </Suspense>
 */
export function ListSkeleton({
  count = 4,
  showThumbnail = false,
  className,
}: ListSkeletonProps) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-label="목록 불러오는 중"
      aria-busy={true}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/60">
          {showThumbnail && (
            <Skeleton className="h-16 w-16 rounded-lg flex-shrink-0" />
          )}
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
