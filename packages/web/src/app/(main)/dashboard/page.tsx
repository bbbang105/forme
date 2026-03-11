import {Suspense} from 'react';
import {DashboardCuration} from '@/components/features/curation/dashboard-curation';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardMemo} from '@/components/features/memo/dashboard-memo';
import {WeatherWidget} from '@/components/features/dashboard/weather-widget';
import {DailyMissions} from '@/components/features/dashboard/daily-missions';
import {AttendanceRecorder} from '@/components/features/dashboard/attendance-recorder';
import {getAuthUser} from '@/lib/auth';
import {db, profiles} from '@forme/shared';
import {eq} from 'drizzle-orm';
import {getFormattedDate, getGreeting} from '@/lib/greetings';

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-28 bg-muted rounded-md" />
      <div className="rounded-xl border border-border/60 bg-muted/40 h-44" />
    </div>
  );
}

function MissionsSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-2 w-full bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  // Parallel data fetching: user + profile resolved together to avoid waterfall.
  // getAuthUser() is React.cache-memoized so the auth call is shared with layout.
  const user = await getAuthUser();
  const [profileResult] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const displayName = profileResult?.displayName ?? '유저';
  const greeting = getGreeting();
  const dateStr = getFormattedDate();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* Visually hidden h1 satisfies WCAG 1.3.1 (page landmark/heading structure).
          The visible h2 greeting serves as the de-facto visual title but screen
          readers need an explicit h1 for correct document outline. */}
      <h1 className="sr-only">대시보드</h1>

      {/* Record attendance on visit */}
      <AttendanceRecorder />

      {/* Hero: Greeting + Weather */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{dateStr}</p>
        <h2 className="text-2xl font-bold tracking-tight">안녕하세요, {displayName}님!</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <Suspense fallback={<div className="h-5" />}>
          <WeatherWidget />
        </Suspense>
      </div>

      {/* Daily Missions */}
      <Suspense fallback={<MissionsSkeleton />}>
        <DailyMissions />
      </Suspense>

      {/* Today's calendar & todos */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCalendar />
      </Suspense>

      {/* Latest curation items */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCuration />
      </Suspense>

      {/* Recent memos */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardMemo />
      </Suspense>
    </div>
  );
}
