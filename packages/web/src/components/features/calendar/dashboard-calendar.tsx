import Link from 'next/link';
import {getAuthUser} from '@/lib/auth';
import {calendarEvents, db, todos} from '@forme/shared';
import {and, asc, eq, gte, lte} from 'drizzle-orm';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {ArrowRight, CalendarDays, CheckCircle2, Circle} from 'lucide-react';

export async function DashboardCalendar() {
  const user = await getAuthUser();

  // KST today using Intl for reliability
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  // Get today's todos
  const todayTodos = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, user.id),
        eq(todos.date, today),
      )
    )
    .orderBy(asc(todos.sortOrder), asc(todos.createdAt))
    .limit(5);

  // Get upcoming events (next 7 days)
  const todayDate = new Date(today + 'T00:00:00+09:00');
  const weekLater = new Date(todayDate);
  weekLater.setDate(weekLater.getDate() + 7);
  const weekLaterStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(weekLater);

  const upcomingEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, user.id),
        lte(calendarEvents.startDate, weekLaterStr),
        gte(calendarEvents.endDate, today),
      )
    )
    .orderBy(asc(calendarEvents.startDate))
    .limit(3);

  const completedCount = todayTodos.filter((t) => t.isCompleted).length;
  const totalCount = todayTodos.length;

  if (totalCount === 0 && upcomingEvents.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          오늘의 할 일
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground font-normal ml-1">
              {completedCount}/{totalCount}
            </span>
          )}
        </CardTitle>
        <Link
          href="/calendar"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          전체 보기
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {/* Today's todos */}
        {todayTodos.length > 0 && (
          <div className="space-y-1">
            {todayTodos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 text-sm">
                {todo.isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className={todo.isCompleted ? 'line-through text-muted-foreground' : ''}>
                  {todo.content}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">다가오는 일정</p>
            {upcomingEvents.map((event) => (
              <div key={event.id} className={`flex items-center gap-2 text-sm ${event.isCompleted ? 'opacity-50' : ''}`}>
                <span
                  className="w-0.5 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: event.color }}
                />
                <span className={`truncate ${event.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                  {event.startTime && <span className="text-xs text-muted-foreground mr-1">{event.startTime}</span>}
                  {event.title}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                  {event.startDate === today
                    ? '오늘'
                    : `${new Date(event.startDate + 'T00:00:00').getMonth() + 1}.${new Date(event.startDate + 'T00:00:00').getDate()}`
                  }
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
