import {getAuthUser} from '@/lib/auth';
import {calendarEvents, db, todos} from '@forme/shared';
import {and, asc, eq, gte, lte} from 'drizzle-orm';
import {CheckCircle2, Circle} from 'lucide-react';
import {SectionHeader} from '@/components/ui/section-header';

export async function DashboardCalendar() {
  const user = await getAuthUser();

  // KST today using Intl for reliability
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(new Date());

  // Get upcoming events (next 7 days)
  const todayDate = new Date(today + 'T00:00:00+09:00');
  const weekLater = new Date(todayDate);
  weekLater.setDate(weekLater.getDate() + 7);
  const weekLaterStr = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(weekLater);

  // Parallelize independent queries
  const [todayTodos, upcomingEvents] = await Promise.all([
    db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, user.id), eq(todos.date, today)))
      .orderBy(asc(todos.sortOrder), asc(todos.createdAt))
      .limit(5),
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, user.id),
          lte(calendarEvents.startDate, weekLaterStr),
          gte(calendarEvents.endDate, today),
        )
      )
      .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.startTime))
      .limit(3),
  ]);

  const completedCount = todayTodos.filter((t) => t.isCompleted).length;
  const totalCount = todayTodos.length;

  if (totalCount === 0 && upcomingEvents.length === 0) return null;

  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow={totalCount > 0 ? `Today · ${completedCount}/${totalCount}` : 'Today'}
        title="오늘의 할 일"
        actionHref="/calendar"
        actionLabel="View all"
      />

      <div className="space-y-4">
        {/* Today's todos */}
        {todayTodos.length > 0 && (
          <ul className="space-y-2">
            {todayTodos.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2.5 text-sm">
                {todo.isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                )}
                <span
                  className={
                    todo.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                  }
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <div className="space-y-2">
            {todayTodos.length > 0 && (
              <div className="pt-2 border-t border-border/60">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Upcoming
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {upcomingEvents.map((event) => (
                <li
                  key={event.id}
                  className={`flex items-center gap-2.5 text-sm ${event.isCompleted ? 'opacity-50' : ''}`}
                >
                  <span
                    className="w-0.5 h-4 shrink-0"
                    style={{backgroundColor: event.color}}
                    aria-hidden="true"
                  />
                  <span
                    className={`truncate min-w-0 flex-1 ${event.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                  >
                    {event.startTime && (
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {event.startTime}
                      </span>
                    )}
                    {event.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground shrink-0">
                    {event.startDate === today
                      ? 'today'
                      : `${new Date(event.startDate + 'T00:00:00').getMonth() + 1}.${new Date(event.startDate + 'T00:00:00').getDate()}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
