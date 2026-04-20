import {Suspense} from 'react';
import {DashboardCuration} from '@/components/features/curation/dashboard-curation';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardVideo} from '@/components/features/video/dashboard-video';

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-28 bg-muted rounded-md" />
      <div className="rounded-xl border border-border/60 bg-muted/40 h-44" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* Visually hidden h1 satisfies WCAG 1.3.1 landmark structure. */}
      <h1 className="sr-only">대시보드</h1>

      {/* Upcoming calendar events */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCalendar />
      </Suspense>

      {/* Latest curation items */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCuration />
      </Suspense>

      {/* Latest YouTube summaries */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardVideo />
      </Suspense>
    </div>
  );
}
