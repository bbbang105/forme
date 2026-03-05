import {Suspense} from 'react';
import {DashboardCuration} from '@/components/features/curation/dashboard-curation';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardMemo} from '@/components/features/memo/dashboard-memo';
import {WeatherWidget} from '@/components/features/dashboard/weather-widget';
import {DailyMissions} from '@/components/features/dashboard/daily-missions';
import {AttendanceRecorder} from '@/components/features/dashboard/attendance-recorder';
import {createClient} from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = '유저';
  if (user) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    if (profile?.displayName) {
      displayName = profile.displayName;
    }
  }

  const greeting = getGreeting();
  const dateStr = getFormattedDate();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
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
