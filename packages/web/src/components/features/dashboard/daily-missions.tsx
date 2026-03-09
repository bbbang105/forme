import { getDailyMissionStats } from '@/lib/actions/activity';
import { CheckSquare, Flame, Headphones, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));

  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export async function DailyMissions() {
  const stats = await getDailyMissionStats();

  const missions = [
    {
      icon: <Newspaper className="h-4 w-4 text-blue-500" />,
      label: '큐레이션 읽기',
      current: stats.curation.today,
      target: stats.curation.target,
      displayCurrent: `${stats.curation.today}`,
      displayTarget: `${stats.curation.target}`,
      streak: stats.curation.streak,
      color: 'bg-blue-500',
      remaining: stats.curation.target - stats.curation.today,
      unit: '개',
    },
    {
      icon: <Headphones className="h-4 w-4 text-purple-500" />,
      label: '팟캐스트 듣기',
      current: stats.podcast.todaySeconds,
      target: stats.podcast.targetSeconds,
      displayCurrent: formatSeconds(stats.podcast.todaySeconds),
      displayTarget: '10:00',
      streak: stats.podcast.streak,
      color: 'bg-purple-500',
      remaining: Math.max(0, stats.podcast.targetSeconds - stats.podcast.todaySeconds),
      unit: '',
    },
    {
      icon: <CheckSquare className="h-4 w-4 text-green-500" />,
      label: '투두 완료',
      current: stats.todos.completed,
      target: Math.max(stats.todos.total, 1),
      displayCurrent: `${stats.todos.completed}`,
      displayTarget: `${stats.todos.total}`,
      streak: stats.todos.streak,
      color: 'bg-green-500',
      remaining: stats.todos.total - stats.todos.completed,
      unit: '개',
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4">
      {/* Attendance streak header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">오늘의 미션</h3>
        {stats.attendance.streak > 0 && (
          <span className="text-sm font-medium">
            <Flame className="h-4 w-4 text-orange-500 inline" /> {stats.attendance.streak}일 연속 출석
          </span>
        )}
      </div>

      {/* Mission progress items */}
      <div className="space-y-3">
        {missions.map((m) => {
          const completed = m.current >= m.target;
          return (
            <div key={m.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span>{m.icon}</span>
                  <span className={cn(completed && 'text-muted-foreground line-through')}>
                    {m.label}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.displayCurrent} / {m.displayTarget}
                </span>
              </div>
              <ProgressBar current={m.current} target={m.target} color={m.color} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {completed
                    ? '달성!'
                    : m.label === '팟캐스트 듣기'
                      ? `${formatSeconds(m.remaining)} 남음`
                      : `${m.remaining}${m.unit} 남음`
                  }
                </span>
                {m.streak > 0 && (
                  <span>{m.streak}일 연속</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
