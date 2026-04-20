import {Suspense} from 'react';
import {DashboardFeed} from '@/components/features/feed/dashboard-feed';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardVideo} from '@/components/features/video/dashboard-video';

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-6 w-40 bg-muted/60 rounded" />
      <div className="h-px w-full bg-border" />
      <div className="space-y-2">
        <div className="h-16 bg-muted/40 rounded" />
        <div className="h-16 bg-muted/40 rounded" />
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
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto space-y-10">
      {/* Visually hidden h1 satisfies WCAG 1.3.1 landmark structure. */}
      <h1 className="sr-only">Dashboard</h1>

      {/* Editorial masthead — today's date in mono, ember em-dash */}
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="text-primary" aria-hidden="true">—</span> {masthead}
        </p>
        <p className="font-display italic text-muted-foreground/70 text-sm">
          forme<span className="text-primary">.</span>
        </p>
      </header>

      {/* Upcoming calendar events */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCalendar />
      </Suspense>

      {/* Latest feed items */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardFeed />
      </Suspense>

      {/* Latest YouTube summaries */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardVideo />
      </Suspense>
    </div>
  );
}
