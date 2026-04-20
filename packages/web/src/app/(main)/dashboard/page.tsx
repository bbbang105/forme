import {Suspense} from 'react';
import {DashboardFeed} from '@/components/features/feed/dashboard-feed';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardVideo} from '@/components/features/video/dashboard-video';

function FeedSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-baseline gap-3 border-b border-border pb-2">
        <div className="h-3 w-12 bg-muted/60 rounded" />
        <div className="h-6 w-44 bg-muted/60 rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 pb-8 border-b border-border">
        <div className="aspect-[16/10] bg-muted/40 rounded-sm" />
        <div className="space-y-4">
          <div className="h-3 w-32 bg-muted/60 rounded" />
          <div className="h-8 w-3/4 bg-muted/60 rounded" />
          <div className="h-8 w-2/3 bg-muted/60 rounded" />
          <div className="h-3 w-full bg-muted/40 rounded" />
          <div className="h-3 w-5/6 bg-muted/40 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
        {Array.from({length: 8}).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-[16/10] bg-muted/40 rounded-sm" />
            <div className="h-3 w-24 bg-muted/60 rounded" />
            <div className="h-4 w-full bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SideWidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-6 w-40 bg-muted/60 rounded" />
      <div className="h-px w-full bg-border" />
      <div className="space-y-2">
        <div className="h-5 bg-muted/40 rounded" />
        <div className="h-5 bg-muted/40 rounded" />
        <div className="h-5 bg-muted/40 rounded" />
      </div>
    </div>
  );
}

/** KST-formatted masthead meta ("04.20 · monday") for the editorial top line. */
function getMastheadMeta(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'long',
  }).format(now);
  return `${month}.${day} · ${weekday.toLowerCase()}`;
}

export default function DashboardPage() {
  const masthead = getMastheadMeta();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto space-y-12">
      {/* Visually hidden h1 satisfies WCAG 1.3.1 landmark structure. */}
      <h1 className="sr-only">Dashboard</h1>

      {/* Editorial masthead — today's date in mono, ember em-dash */}
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="text-primary" aria-hidden="true">
            —
          </span>{' '}
          {masthead}
        </p>
        <p className="font-display italic text-muted-foreground/70 text-sm">
          forme<span className="text-primary">.</span>
        </p>
      </header>

      {/* Feed — primary, full width (hero rotator + 8-card grid) */}
      <Suspense fallback={<FeedSkeleton />}>
        <DashboardFeed />
      </Suspense>

      {/* Secondary widgets: Calendar + YouTube side-by-side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
        <Suspense fallback={<SideWidgetSkeleton />}>
          <DashboardCalendar />
        </Suspense>
        <Suspense fallback={<SideWidgetSkeleton />}>
          <DashboardVideo />
        </Suspense>
      </div>
    </div>
  );
}
