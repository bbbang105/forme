export function VideoFeedSkeleton() {
  return (
    <div
      className="space-y-4 px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto"
      role="status"
      aria-label="유튜브 피드 불러오는 중"
      aria-busy={true}
    >
      {/* Source bar skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-24 motion-safe:animate-pulse rounded-full bg-muted"
          />
        ))}
        <div className="h-8 w-20 motion-safe:animate-pulse rounded-full bg-muted" />
      </div>

      {/* Collect bar skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-32 motion-safe:animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-16 motion-safe:animate-pulse rounded-md bg-muted" />
      </div>

      {/* Status chips skeleton */}
      <div className="flex gap-2">
        <div className="h-8 w-20 motion-safe:animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-20 motion-safe:animate-pulse rounded-full bg-muted" />
      </div>

      {/* Card skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-lg border border-border/60 p-3"
        >
          <div className="h-20 w-36 shrink-0 motion-safe:animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-3/4 motion-safe:animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 motion-safe:animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 motion-safe:animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
